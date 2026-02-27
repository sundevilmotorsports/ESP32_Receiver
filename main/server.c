#include "server.h"
#include <esp_log.h>
#include <esp_http_server.h>
#include <esp_timer.h>
#include <sys/unistd.h>
#include <string.h>
#include <stdlib.h>
#include <stdbool.h>
#include "hash.h"
#include "ESP32_Receiver.h"
#include "esp_crc.h"
#include "rom/ets_sys.h"

extern const uint8_t index_html_start[] asm("_binary_index_html_start");
extern const uint8_t index_html_end[] asm("_binary_index_html_end");

extern const uint8_t index_css_start[] asm("_binary_index_css_start");
extern const uint8_t index_css_end[] asm("_binary_index_css_end");

extern const uint8_t index_js_start[] asm("_binary_index_js_start");
extern const uint8_t index_js_end[] asm("_binary_index_js_end");

static const char *TAG = "server";

static struct HashTable table;
static struct HashTable gates;

#define MAX_GATE_CONFIGS 10

typedef enum {
    GATE_MODE_DELTA,   // standalone delta timer
    GATE_MODE_SERIES,  // part of a sequential track/series
} gate_mode_t;

typedef struct {
    char mac[18];
    gate_mode_t mode;
    char group[32];      // group/series name (empty = ungrouped)
    int order;           // sort order within group
} gate_config_t;

#define MAX_GATE_HISTORY 50

typedef struct {
    char mac_str[18];
    int64_t timestamps_us[MAX_GATE_HISTORY]; // absolute µs (esp_timer_get_time)
    int64_t diffs_us[MAX_GATE_HISTORY];      // delta from previous trigger for this gate
    int count;
} gate_history_t;

static gate_history_t gate_history[MAX_GATE_CONFIGS];
static int gate_history_count = 0;

static gate_config_t gate_configs[MAX_GATE_CONFIGS];
static int gate_config_count = 0;

static gate_config_t* find_gate_config(const char* mac) {
    for (int i = 0; i < gate_config_count; i++) {
        if (strcmp(gate_configs[i].mac, mac) == 0)
            return &gate_configs[i];
    }
    return NULL;
}

static gate_config_t* get_or_create_gate_config(const char* mac) {
    gate_config_t* cfg = find_gate_config(mac);
    if (cfg) return cfg;
    if (gate_config_count >= MAX_GATE_CONFIGS) return NULL;
    cfg = &gate_configs[gate_config_count++];
    strncpy(cfg->mac, mac, sizeof(cfg->mac) - 1);
    cfg->mac[sizeof(cfg->mac) - 1] = '\0';
    cfg->mode = GATE_MODE_DELTA;
    cfg->group[0] = '\0';
    cfg->order = gate_config_count - 1;
    return cfg;
}

void addGateTime(const char* mac_addr, const char* data) {
    hashtable_insert(&gates, mac_addr, data);

    // Parse timestamp_us and diff_us from data string "timestamp_us,diff_us"
    int64_t timestamp_us = 0, diff_us = 0;
    sscanf(data, "%lld,%lld", &timestamp_us, &diff_us);

    gate_history_t *hist = NULL;
    for (int i = 0; i < gate_history_count; i++) {
        if (strcmp(gate_history[i].mac_str, mac_addr) == 0) {
            hist = &gate_history[i];
            break;
        }
    }

    if (hist == NULL) {
        if (gate_history_count >= MAX_GATE_CONFIGS) {
            ESP_LOGW(TAG, "Gate history table full, dropping entry for %s", mac_addr);
            return;
        }
        hist = &gate_history[gate_history_count++];
        strncpy(hist->mac_str, mac_addr, sizeof(hist->mac_str) - 1);
        hist->mac_str[sizeof(hist->mac_str) - 1] = '\0';
        hist->count = 0;
    }

    if (hist->count < MAX_GATE_HISTORY) {
        hist->timestamps_us[hist->count] = timestamp_us;
        hist->diffs_us[hist->count]      = diff_us;
        hist->count++;
    } else {
        // Ring-buffer: shift entries left and append
        memmove(&hist->timestamps_us[0], &hist->timestamps_us[1],
                (MAX_GATE_HISTORY - 1) * sizeof(int64_t));
        memmove(&hist->diffs_us[0], &hist->diffs_us[1],
                (MAX_GATE_HISTORY - 1) * sizeof(int64_t));
        hist->timestamps_us[MAX_GATE_HISTORY - 1] = timestamp_us;
        hist->diffs_us[MAX_GATE_HISTORY - 1]      = diff_us;
    }
}

void set_cors(httpd_req_t *req) {
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Methods", "*");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Headers", "*");
    httpd_resp_set_hdr(req, "Access-Control-Max-Age", "86400");
}

static esp_err_t status_get_handler(httpd_req_t *req) {
    set_cors(req);

    const char* resp_str = "OK";
    httpd_resp_set_type(req, "text/plain");
    httpd_resp_send(req, resp_str, HTTPD_RESP_USE_STRLEN);
    return ESP_OK;
}

static esp_err_t cors_options_handler(httpd_req_t *req) {
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Headers", "*");
    httpd_resp_set_hdr(req, "Access-Control-Max-Age", "86400");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Credentials", "true");

    httpd_resp_send(req, NULL, 0);
    return ESP_OK;
}

static const httpd_uri_t cors_options = {
    .uri       = "/*",
    .method    = HTTP_OPTIONS,
    .handler   = cors_options_handler,
    .user_ctx  = NULL
};

static const httpd_uri_t status = {
    .uri       = "/status",
    .method    = HTTP_GET,
    .handler   = status_get_handler,
    .user_ctx  = NULL
};

static void escape_json_string(char* dest, const char* src, size_t dest_size) {
    size_t dest_pos = 0;
    size_t src_len = strlen(src);

    for (size_t i = 0; i < src_len && dest_pos < dest_size - 1; i++) {
        char c = src[i];

        if (dest_pos >= dest_size - 6) break;

        switch (c) {
            case '"':
                dest[dest_pos++] = '\\';
                dest[dest_pos++] = '"';
                break;
            case '\\':
                dest[dest_pos++] = '\\';
                dest[dest_pos++] = '\\';
                break;
            case '\b':
                dest[dest_pos++] = '\\';
                dest[dest_pos++] = 'b';
                break;
            case '\f':
                dest[dest_pos++] = '\\';
                dest[dest_pos++] = 'f';
                break;
            case '\n':
                dest[dest_pos++] = '\\';
                dest[dest_pos++] = 'n';
                break;
            case '\r':
                dest[dest_pos++] = '\\';
                dest[dest_pos++] = 'r';
                break;
            case '\t':
                dest[dest_pos++] = '\\';
                dest[dest_pos++] = 't';
                break;
            default:
                if (c < 0x20 || c == 0x7F) {
                    dest_pos += snprintf(dest + dest_pos, dest_size - dest_pos, "\\u%04x", (unsigned char)c);
                } else {
                    dest[dest_pos++] = c;
                }
                break;
        }
    }
    dest[dest_pos] = '\0';
}

void addString(const char* key, const char* value) {
    hashtable_insert(&table, key, value);
}

static esp_err_t root_get_handler(httpd_req_t *req) {
    set_cors(req);
    httpd_resp_set_type(req, "text/html");
    httpd_resp_send(req, (const char *)index_html_start, index_html_end - index_html_start);
    return ESP_OK;
}
static esp_err_t index_css_get_handler(httpd_req_t *req) {
    set_cors(req);
    httpd_resp_set_type(req, "text/css");
    httpd_resp_send(req, (const char *)index_css_start, index_css_end - index_css_start);
    return ESP_OK;
}

static esp_err_t index_js_get_handler(httpd_req_t *req) {
    set_cors(req);
    httpd_resp_set_type(req, "application/javascript");
    httpd_resp_send(req, (const char *)index_js_start, index_js_end - index_js_start);
    return ESP_OK;
}

static const httpd_uri_t root = {
    .uri       = "/",
    .method    = HTTP_GET,
    .handler   = root_get_handler,
    .user_ctx  = NULL
};

static const httpd_uri_t index_css = {
    .uri       = "/assets/index.css",
    .method    = HTTP_GET,
    .handler   = index_css_get_handler,
    .user_ctx  = NULL
};

static const httpd_uri_t index_js = {
    .uri       = "/assets/index.js",
    .method    = HTTP_GET,
    .handler   = index_js_get_handler,
    .user_ctx  = NULL
};

static esp_err_t telemetry_get_handler(httpd_req_t *req) {
    set_cors(req);

    const char* uri = req->uri;

    // Extract the key from the URI (everything after /telemetry/)
    const char* key = uri + strlen("/telemetry/");

    ESP_LOGI(TAG, "Telemetry request for key: %s", key);

    const char* response = hashtable_get(&table, key);

    if (response == NULL) {
        httpd_resp_set_type(req, "text/plain");
        httpd_resp_send(req, "NULL", HTTPD_RESP_USE_STRLEN);
        return ESP_OK;
    }

    httpd_resp_set_type(req, "application/json");
    httpd_resp_send(req, response, HTTPD_RESP_USE_STRLEN);

    return ESP_OK;
}

static esp_err_t telemetry_all_get_handler(httpd_req_t *req) {
    set_cors(req);
    httpd_resp_set_type(req, "application/json");

    char** keys = hashtable_list_keys(&table);
    httpd_resp_sendstr_chunk(req, "[");

    bool first = true;
    char chunk[128];
    for (int i = 0; keys && i < table.size; i++) {
        if (keys[i] == NULL) continue;
        const char* value = hashtable_get(&table, keys[i]);
        if (value == NULL) continue;
        if (!first) httpd_resp_sendstr_chunk(req, ",");
        snprintf(chunk, sizeof(chunk), "{\"key\":\"%s\",\"value\":\"%s\"}", keys[i], value);
        httpd_resp_sendstr_chunk(req, chunk);
        first = false;
    }

    httpd_resp_sendstr_chunk(req, "]");
    httpd_resp_sendstr_chunk(req, NULL);
    return ESP_OK;
}

// Takes a mac address string such as FF:FF:FF:FF:FF:FF and returns an uint8_t*
uint8_t* string_to_mac(const char* str) {
    if (!str) return NULL;

    uint8_t *mac = malloc(6 * sizeof(uint8_t));
    if (!mac) return NULL;

    unsigned int bytes[6];

    if (sscanf(str, "%02X:%02X:%02X:%02X:%02X:%02X",
        &bytes[0], &bytes[1], &bytes[2],
        &bytes[3], &bytes[4], &bytes[5]) != 6) {
            free(mac);
            return NULL;
        }

    for (int i = 0; i < 6; i++)
        mac[i] = (uint8_t)bytes[i];

    return mac;
}

esp_err_t send_ident_command(const uint8_t* dest_mac) {
    espnow_data_t *buf = malloc(sizeof(espnow_data_t));
    if (buf == NULL) {
        ESP_LOGE(TAG, "Malloc send buffer fail");
        return ESP_ERR_NO_MEM;
    }

    buf->type = ESPNOW_GATE_IDENT;
    buf->seq_num = s_espnow_seq[ESPNOW_DATA_UNICAST]++;
    buf->crc = 0;
    buf->crc = esp_crc16_le(UINT16_MAX, (uint8_t const *)buf, sizeof(espnow_data_t));

    const esp_err_t ret = esp_now_send(dest_mac, (uint8_t *)buf, sizeof(espnow_data_t));
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Send ident error: %s", esp_err_to_name(ret));
        return ret;
    }

    ESP_LOGI(TAG, "Sent ident to " MACSTR, MAC2STR(dest_mac));
    return ESP_OK;
}

static esp_err_t identify_gate_handler(httpd_req_t *req) {
    set_cors(req);

    char content[100];
    size_t recv_size = (req->content_len < sizeof(content) - 1) ? req->content_len : sizeof(content) - 1;

    int ret = httpd_req_recv(req, content, recv_size);
    if (ret <= 0) {
        if (ret == HTTPD_SOCK_ERR_TIMEOUT) {
            httpd_resp_send_408(req);
        }
        return ESP_FAIL;
    }

    content[ret] = '\0';

    ESP_LOGI(TAG, "Received POST data: %s", content);
    ESP_LOGI(TAG, "Requested to identify timing gate: %s", content);

    uint8_t* dest_mac = string_to_mac(content);
    if (!dest_mac) {
        httpd_resp_set_type(req, "text/plain");
        httpd_resp_send(req, "Invalid MAC address format", HTTPD_RESP_USE_STRLEN);
        return ESP_FAIL;
    }

    esp_err_t result = send_ident_command(dest_mac);
    free(dest_mac);

    if (result == ESP_OK) {
        httpd_resp_set_type(req, "text/plain");
        httpd_resp_send(req, "OK", HTTPD_RESP_USE_STRLEN);
    } else {
        httpd_resp_set_type(req, "text/plain");
        httpd_resp_send(req, "Failed to send ident command", HTTPD_RESP_USE_STRLEN);
    }

    return result;
}

static esp_err_t get_gates_handler(httpd_req_t *req) {
    set_cors(req);
    httpd_resp_set_type(req, "application/json");

    mac_address_list_t *mac_list = get_mac_list();
    char chunk[32];
    httpd_resp_sendstr_chunk(req, "[");
    for (int i = 0; i < mac_list->count; i++) {
        if (i > 0) httpd_resp_sendstr_chunk(req, ",");
        snprintf(chunk, sizeof(chunk), "\""MACSTR"\"", MAC2STR(mac_list->mac_list[i].addr));
        httpd_resp_sendstr_chunk(req, chunk);
    }
    httpd_resp_sendstr_chunk(req, "]");
    httpd_resp_sendstr_chunk(req, NULL);
    return ESP_OK;
}

static esp_err_t get_gate_data_handler(httpd_req_t *req) {
    set_cors(req);
    httpd_resp_set_type(req, "application/json");

    char** keys = hashtable_list_keys(&gates);
    httpd_resp_sendstr_chunk(req, "[");

    bool first = true;
    char chunk[96];
    for (int i = 0; keys && i < gates.size; i++) {
        if (keys[i] == NULL) continue;
        const char* value = hashtable_get(&gates, keys[i]);
        if (value == NULL) continue;
        int64_t timestamp_us, diff_us;
        sscanf(value, "%lld,%lld", &timestamp_us, &diff_us);
        if (!first) httpd_resp_sendstr_chunk(req, ",");
        snprintf(chunk, sizeof(chunk),
            "{\"mac\":\"%s\",\"timestamp_us\":%lld,\"diff_us\":%lld}",
            keys[i], timestamp_us, diff_us);
        httpd_resp_sendstr_chunk(req, chunk);
        first = false;
    }

    httpd_resp_sendstr_chunk(req, "]");
    httpd_resp_sendstr_chunk(req, NULL);
    return ESP_OK;
}

static const httpd_uri_t telemetry = {
    .uri       = "/telemetry/*",
    .method    = HTTP_GET,
    .handler   = telemetry_get_handler,
    .user_ctx  = NULL
};

static const httpd_uri_t telemetry_all = {
    .uri       = "/telemetry",
    .method    = HTTP_GET,
    .handler   = telemetry_all_get_handler,
    .user_ctx  = NULL
};

static const httpd_uri_t identify_gate = {
    .uri       = "/ident",
    .method    = HTTP_POST,
    .handler   = identify_gate_handler,
    .user_ctx  = NULL
};

static const httpd_uri_t get_gates = {
    .uri       = "/gates",
    .method    = HTTP_GET,
    .handler   = get_gates_handler,
    .user_ctx  = NULL
};

static const httpd_uri_t get_gates_data = {
    .uri       = "/timing",
    .method    = HTTP_GET,
    .handler   = get_gate_data_handler,
    .user_ctx  = NULL
};

// GET /gate-config  -> returns all gate configs as JSON array
static esp_err_t gate_config_get_handler(httpd_req_t *req) {
    set_cors(req);
    httpd_resp_set_type(req, "application/json");

    httpd_resp_sendstr_chunk(req, "[");
    char chunk[96];
    for (int i = 0; i < gate_config_count; i++) {
        if (i > 0) httpd_resp_sendstr_chunk(req, ",");
        snprintf(chunk, sizeof(chunk),
            "{\"mac\":\"%s\",\"mode\":\"%s\",\"group\":\"%s\",\"order\":%d}",
            gate_configs[i].mac,
            gate_configs[i].mode == GATE_MODE_SERIES ? "series" : "delta",
            gate_configs[i].group,
            gate_configs[i].order);
        httpd_resp_sendstr_chunk(req, chunk);
    }
    httpd_resp_sendstr_chunk(req, "]");
    httpd_resp_sendstr_chunk(req, NULL);
    return ESP_OK;
}

// POST /gate-config  body: {"mac":"AA:BB:CC:DD:EE:FF","mode":"delta|series","group":"name","order":N}
static esp_err_t gate_config_post_handler(httpd_req_t *req) {
    set_cors(req);

    char body[256];
    int total = 0;
    int remaining = sizeof(body) - 1;
    while (remaining > 0) {
        int r = httpd_req_recv(req, body + total, remaining);
        if (r < 0) {
            if (r == HTTPD_SOCK_ERR_TIMEOUT) continue;
            httpd_resp_send_408(req);
            return ESP_FAIL;
        }
        if (r == 0) break;
        total += r;
        remaining -= r;
    }
    if (total == 0) { httpd_resp_send_408(req); return ESP_FAIL; }
    body[total] = '\0';

    ESP_LOGI(TAG, "gate-config POST body (%d bytes): %s", total, body);

    char mac[18] = {0}, mode[16] = {0}, group[32] = {0};
    int order = -1;

    char* p;
    if ((p = strstr(body, "\"mac\"")))    sscanf(p, "\"mac\":\"%17[^\"]\"", mac);
    if ((p = strstr(body, "\"mode\"")))   sscanf(p, "\"mode\":\"%15[^\"]\"", mode);
    if ((p = strstr(body, "\"group\"")))  sscanf(p, "\"group\":\"%31[^\"]\"", group);
    if ((p = strstr(body, "\"order\"")))  sscanf(p, "\"order\":%d", &order);

    ESP_LOGI(TAG, "Parsed: mac='%s' mode='%s' group='%s' order=%d", mac, mode, group, order);

    if (mac[0] == '\0') {
        httpd_resp_set_type(req, "text/plain");
        httpd_resp_send(req, "Missing mac", HTTPD_RESP_USE_STRLEN);
        return ESP_FAIL;
    }

    gate_config_t* cfg = get_or_create_gate_config(mac);
    if (!cfg) {
        httpd_resp_set_type(req, "text/plain");
        httpd_resp_send(req, "Too many gates", HTTPD_RESP_USE_STRLEN);
        return ESP_FAIL;
    }

    if (mode[0] != '\0') {
        cfg->mode = (strcmp(mode, "series") == 0) ? GATE_MODE_SERIES : GATE_MODE_DELTA;
    }

    // group is always present in the payload (may be empty string)
    strncpy(cfg->group, group, sizeof(cfg->group) - 1);
    cfg->group[sizeof(cfg->group) - 1] = '\0';

    if (order >= 0) cfg->order = order;

    ESP_LOGI(TAG, "Gate config saved: mac=%s mode=%d group='%s' order=%d",
             cfg->mac, cfg->mode, cfg->group, cfg->order);

    httpd_resp_set_type(req, "text/plain");
    httpd_resp_send(req, "OK", HTTPD_RESP_USE_STRLEN);
    return ESP_OK;
}

static const httpd_uri_t gate_config_get = {
    .uri     = "/gate-config",
    .method  = HTTP_GET,
    .handler = gate_config_get_handler,
    .user_ctx = NULL
};

static const httpd_uri_t gate_config_post = {
    .uri     = "/gate-config",
    .method  = HTTP_POST,
    .handler = gate_config_post_handler,
    .user_ctx = NULL
};

static esp_err_t gate_history_csv_handler(httpd_req_t *req) {
    set_cors(req);
    httpd_resp_set_type(req, "text/csv");
    httpd_resp_set_hdr(req, "Content-Disposition", "attachment; filename=\"timing.csv\"");

    httpd_resp_sendstr_chunk(req, "mac,trigger_index,timestamp_us,diff_us\r\n");

    char row[80];
    for (int i = 0; i < gate_history_count; i++) {
        for (int j = 0; j < gate_history[i].count; j++) {
            snprintf(row, sizeof(row), "%s,%d,%lld,%lld\r\n",
                     gate_history[i].mac_str, j,
                     gate_history[i].timestamps_us[j],
                     gate_history[i].diffs_us[j]);
            httpd_resp_sendstr_chunk(req, row);
        }
    }

    httpd_resp_sendstr_chunk(req, NULL);
    return ESP_OK;
}

static const httpd_uri_t gate_history_csv = {
    .uri     = "/timing/export.csv",
    .method  = HTTP_GET,
    .handler = gate_history_csv_handler,
    .user_ctx = NULL
};

httpd_handle_t start(void) {
    table = hashtable_create();
    gates = hashtable_create();

    // struct GateData gate1_data = {"1000", "1.5"};
    // struct GateData gate2_data = {"2000", "2.3"};
    // struct GateData gate3_data = {"3000", "1.8"};
    //
    // hashtable_insert(&table, "gate1", &gate1_data);
    // hashtable_insert(&table, "gate2", &gate2_data);
    // hashtable_insert(&table, "gate3", &gate3_data);

    hashtable_insert(&table, "test", "value");

    httpd_handle_t server = NULL;
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.server_port = 3000;
    config.max_uri_handlers = 14;
    config.lru_purge_enable = true;
    config.stack_size = 8192;
    config.recv_wait_timeout = 3;
    config.send_wait_timeout = 3;

    ESP_LOGI(TAG, "Starting server on port: '%d'", config.server_port);
    if (httpd_start(&server, &config) == ESP_OK) {
        httpd_register_uri_handler(server, &cors_options);
        httpd_register_uri_handler(server, &status);
        httpd_register_uri_handler(server, &telemetry_all);
        httpd_register_uri_handler(server, &telemetry);

        httpd_register_uri_handler(server, &root);
        httpd_register_uri_handler(server, &index_css);
        httpd_register_uri_handler(server, &index_js);

        httpd_register_uri_handler(server, &identify_gate);
        httpd_register_uri_handler(server, &get_gates);
        httpd_register_uri_handler(server, &get_gates_data);
        httpd_register_uri_handler(server, &gate_config_get);
        httpd_register_uri_handler(server, &gate_config_post);
        httpd_register_uri_handler(server, &gate_history_csv);

        return server;
    }

    ESP_LOGI(TAG, "Error starting server!");
    return NULL;
}

void server_start() {
    httpd_handle_t server = start();

    while (server) {
        sleep(5);
    }
}

esp_err_t server_stop(httpd_handle_t server) {
    return httpd_stop(server);
}

char* getCurrentTimestamp() {
    static char timestamp[32];

    uint64_t uptime_ms = esp_timer_get_time() / 1000;

    snprintf(timestamp, sizeof(timestamp), "%llu", uptime_ms);
    return timestamp;
}
