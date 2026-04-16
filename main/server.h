#ifndef ESP32_RECEIVER_SERVER_H
#define ESP32_RECEIVER_SERVER_H

#include <esp_http_server.h>
#include <stdbool.h>

void server_start();
esp_err_t server_stop(httpd_handle_t server);
void addString(const char* key, const char* value);
void addGateTime(const char* mac_addr, const char* data);
void setGateStuck(const char* mac_addr, bool stuck);

#endif //ESP32_RECEIVER_SERVER_H