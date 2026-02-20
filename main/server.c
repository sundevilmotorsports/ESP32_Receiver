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

    char** keys = hashtable_list_keys(&table);

    if (!keys) {
        httpd_resp_set_type(req, "application/json");
        httpd_resp_send(req, "[]", HTTPD_RESP_USE_STRLEN);
        return ESP_OK;
    }

    char* buffer = malloc(8192);
    if (!buffer) {
        httpd_resp_set_type(req, "text/plain");
        httpd_resp_send(req, "Failed to allocate memory", HTTPD_RESP_USE_STRLEN);
        return ESP_OK;
    }

    int pos = 0;
    pos += snprintf(buffer + pos, 8192 - pos, "[");

    bool first = true;
    for (int i = 0; i < table.size; i++) {
        if (keys[i] != NULL) {
            const char* value = hashtable_get(&table, keys[i]);
            if (value != NULL) {
                if (!first) {
                    pos += snprintf(buffer + pos, 8192 - pos, ",");
                }
                pos += snprintf(buffer + pos, 8192 - pos,
                    "{\"key\":\"%s\",\"value\":\"%s\"}",
                    keys[i], value);
                first = false;

                if (pos >= 7500) {
                    break;
                }
            }
        }
    }

    pos += snprintf(buffer + pos, 8192 - pos, "]");

    httpd_resp_set_type(req, "application/json");
    httpd_resp_send(req, buffer, pos);

    free(buffer);

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

httpd_handle_t start(void) {
    table = hashtable_create();

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
    config.lru_purge_enable = true;

    ESP_LOGI(TAG, "Starting server on port: '%d'", config.server_port);
    if (httpd_start(&server, &config) == ESP_OK) {
        httpd_register_uri_handler(server, &cors_options);
        httpd_register_uri_handler(server, &status);
        // httpd_register_uri_handler(server, &gate);
        httpd_register_uri_handler(server, &telemetry_all);
        httpd_register_uri_handler(server, &telemetry);

        httpd_register_uri_handler(server, &root);
        httpd_register_uri_handler(server, &index_css);
        httpd_register_uri_handler(server, &index_js);

        httpd_register_uri_handler(server, &identify_gate);

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
