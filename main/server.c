#include "server.h"
#include <esp_log.h>
#include <esp_http_server.h>
#include <esp_timer.h>
#include <sys/unistd.h>
#include <string.h>
#include <stdlib.h>
#include <stdbool.h>
#include "hash.h"

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

// static esp_err_t gate_get_handler(httpd_req_t *req) {
//     httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
//     httpd_resp_set_hdr(req, "Access-Control-Allow-Methods", "*");
//     httpd_resp_set_hdr(req, "Access-Control-Allow-Headers", "*");
//     httpd_resp_set_hdr(req, "Access-Control-Max-Age", "86400");
//
//     char** keys = hashtable_list_keys(&table);
//
//     if (!keys) {
//         httpd_resp_set_type(req, "application/json");
//         httpd_resp_send(req, "{\"gates\":[]}", HTTPD_RESP_USE_STRLEN);
//         return ESP_OK;
//     }
//
//     char* buffer = malloc(8192);
//     if (!buffer) {
//         httpd_resp_set_type(req, "text/plain");
//         httpd_resp_send(req, "Failed to allocate memory", HTTPD_RESP_USE_STRLEN);
//         return ESP_OK;
//     }
//
//     char escaped_macaddr[128];
//     char escaped_timestamp[128];
//     char escaped_time_delta[128];
//
//     int pos = 0;
//     pos += snprintf(buffer + pos, 8192 - pos, "{\"gates\":[");
//
//     bool first = true;
//     for (int i = 0; i < table.size; i++) {
//         if (keys[i] != NULL) {
//             struct GateData* gate_data = hashtable_get(&table, keys[i]);
//             if (gate_data != NULL) {
//                 if (!first) {
//                     pos += snprintf(buffer + pos, 8192 - pos, ",");
//                 }
//
//                 // Escape each field properly
//                 escape_json_string(escaped_macaddr, keys[i], sizeof(escaped_macaddr));
//                 escape_json_string(escaped_timestamp,
//                     gate_data->timestamp ? gate_data->timestamp : "",
//                     sizeof(escaped_timestamp));
//                 escape_json_string(escaped_time_delta,
//                     gate_data->time_delta ? gate_data->time_delta : "",
//                     sizeof(escaped_time_delta));
//
//                 pos += snprintf(buffer + pos, 8192 - pos,
//                     "{\"macaddr\":\"%s\",\"timestamp\":\"%s\",\"time_delta\":\"%s\"}",
//                     escaped_macaddr,
//                     escaped_timestamp,
//                     escaped_time_delta);
//                 first = false;
//
//                 if (pos >= 7500) { // Leave more room for closing bracket and null terminator
//                     break;
//                 }
//             }
//         }
//     }
//
//     pos += snprintf(buffer + pos, 8192 - pos, "]}");
//
//     httpd_resp_set_type(req, "application/json");
//     httpd_resp_send(req, buffer, pos);
//
//     free(buffer);
//
//     return ESP_OK;
// }
//
// static const httpd_uri_t gate = {
//     .uri       = "/gates",
//     .method    = HTTP_GET,
//     .handler   = gate_get_handler,
//     .user_ctx  = NULL
// };

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
