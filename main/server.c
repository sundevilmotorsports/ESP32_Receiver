#include "server.h"
#include <esp_log.h>
#include <esp_http_server.h>
#include <esp_timer.h>
#include <sys/unistd.h>
#include <string.h>
#include <stdlib.h>
#include <stdbool.h>
#include "hash.h"

static const char *TAG = "server";

static struct HashTable table;

static esp_err_t status_get_handler(httpd_req_t *req) {
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Methods", "*");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Headers", "*");
    httpd_resp_set_hdr(req, "Access-Control-Max-Age", "86400");

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

static esp_err_t gate_get_handler(httpd_req_t *req) {
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Methods", "*");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Headers", "*");
    httpd_resp_set_hdr(req, "Access-Control-Max-Age", "86400");

    char** keys = hashtable_list_keys(&table);

    if (!keys) {
        httpd_resp_set_type(req, "application/json");
        httpd_resp_send(req, "{\"gates\":[]}", HTTPD_RESP_USE_STRLEN);
        return ESP_OK;
    }

    char* buffer = malloc(4096);
    if (!buffer) {
        httpd_resp_set_type(req, "text/plain");
        httpd_resp_send(req, "Failed to allocate memory", HTTPD_RESP_USE_STRLEN);
        return ESP_OK;
    }

    int pos = 0;
    pos += snprintf(buffer + pos, 4096 - pos, "{\"gates\":[");

    bool first = true;
    for (int i = 0; i < table.size; i++) {
        if (keys[i] != NULL) {
            struct GateData* gate_data = hashtable_get(&table, keys[i]);
            if (gate_data != NULL) {
                if (!first) {
                    pos += snprintf(buffer + pos, 4096 - pos, ",");
                }
                pos += snprintf(buffer + pos, 4096 - pos,
                    "{\"macaddr\":\"%s\",\"timestamp\":\"%s\",\"time_delta\":\"%s\"}",
                    keys[i],
                    gate_data->timestamp ? gate_data->timestamp : "",
                    gate_data->time_delta ? gate_data->time_delta : "");
                first = false;

                if (pos >= 4000) {
                    break;
                }
            }
        }
    }

    pos += snprintf(buffer + pos, 4096 - pos, "]}");

    httpd_resp_set_type(req, "application/json");
    httpd_resp_send(req, buffer, pos);

    free(buffer);

    return ESP_OK;
}

static const httpd_uri_t gate = {
    .uri       = "/gates",
    .method    = HTTP_GET,
    .handler   = gate_get_handler,
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

    httpd_handle_t server = NULL;
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.server_port = 3000;
    config.lru_purge_enable = true;

    ESP_LOGI(TAG, "Starting server on port: '%d'", config.server_port);
    if (httpd_start(&server, &config) == ESP_OK) {
        httpd_register_uri_handler(server, &cors_options);
        httpd_register_uri_handler(server, &status);
        httpd_register_uri_handler(server, &gate);
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

void addGate(char* macaddr) {
    struct GateData gate_data = {NULL, NULL};
    hashtable_insert(&table, macaddr, &gate_data);
}

char* getCurrentTimestamp() {
    static char timestamp[32];

    uint64_t uptime_ms = esp_timer_get_time() / 1000;

    snprintf(timestamp, sizeof(timestamp), "%llu", uptime_ms);
    return timestamp;
}

void addTime(char* macaddr, char* time_delta) {
    struct GateData new_data;

    new_data.timestamp = getCurrentTimestamp();
    new_data.time_delta = time_delta;

    hashtable_insert(&table, macaddr, &new_data);
}