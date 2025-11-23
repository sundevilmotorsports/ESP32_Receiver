#include "server.h"
#include <esp_log.h>
#include <esp_http_server.h>
#include <sys/unistd.h>
#include <string.h>
#include <stdlib.h>
#include <stdbool.h>
#include "hash.h"

static const char *TAG = "server";

static struct HashTable table;

static esp_err_t status_get_handler(httpd_req_t *req) {
    const char* resp_str = "OK";
    httpd_resp_set_type(req, "text/plain");
    httpd_resp_send(req, resp_str, HTTPD_RESP_USE_STRLEN);
    return ESP_OK;
}

static const httpd_uri_t status = {
    .uri       = "/status",
    .method    = HTTP_GET,
    .handler   = status_get_handler,
    .user_ctx  = NULL
};

static esp_err_t gate_get_handler(httpd_req_t *req) {
    char** keys = hashtable_list_keys(&table);

    if (!keys) {
        httpd_resp_set_type(req, "application/json");
        httpd_resp_send(req, "{\"gates\":[]}", HTTPD_RESP_USE_STRLEN);
        return ESP_OK;
    }

    char* buffer = malloc(2048);
    if (!buffer) {
        httpd_resp_set_type(req, "text/plain");
        httpd_resp_send(req, "Failed to allocate memory", HTTPD_RESP_USE_STRLEN);
        free(keys);
        return ESP_OK;
    }

    strcpy(buffer, "{\"gates\":[");

    bool first = true;
    for (int i = 0; i < table.size; i++) {
        if (keys[i] != NULL) {
            if (!first) {
                strcat(buffer, ",");
            }
            strcat(buffer, "\"");
            strcat(buffer, keys[i]);
            strcat(buffer, "\"");
            first = false;
        }
    }

    strcat(buffer, "]}");

    httpd_resp_set_type(req, "application/json");
    httpd_resp_send(req, buffer, strlen(buffer));

    free(buffer);
    free(keys);

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

    hashtable_insert(&table, "gate1", "some time");
    hashtable_insert(&table, "gate2", "another time");
    hashtable_insert(&table, "gate3", "different time");

    httpd_handle_t server = NULL;
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.server_port = 3000;
    config.lru_purge_enable = true;

    ESP_LOGI(TAG, "Starting server on port: '%d'", config.server_port);
    if (httpd_start(&server, &config) == ESP_OK) {
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
