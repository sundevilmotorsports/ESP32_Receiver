#include <stdio.h>
#include <stdlib.h>
#include <time.h>
#include <string.h>
#include <assert.h>
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "freertos/timers.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include "nvs_flash.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_now.h"
#include "esp_crc.h"
#include "ESP32_Receiver.h"

#include "esp_timer.h"
#include "server.h"

#define ESPNOW_QUEUE_SIZE 6
#define ACK_TIMER_INTERVAL_MS (15 * 1000)
#define PING_TIMER_INTERVAL_MS (10 * 1000)

static QueueHandle_t s_espnow_queue;
static mac_address_list_t mac_list = {0};
static uint8_t s_broadcast_mac[ESP_NOW_ETH_ALEN] = { 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF };
static uint16_t s_espnow_seq[ESPNOW_DATA_MAX] = { 0, 0 };
static TimerHandle_t ack_timer;
static TimerHandle_t ping_timer;

void mac_to_string(const uint8_t *mac_addr, char *mac_string) {
    snprintf(mac_string, 18, "%02x:%02x:%02x:%02x:%02x:%02x",
             mac_addr[0], mac_addr[1], mac_addr[2],
             mac_addr[3], mac_addr[4], mac_addr[5]);
}

static TaskHandle_t ack_task_handle = NULL;
static TaskHandle_t ping_task_handle = NULL;

void ack_timer_callback(TimerHandle_t xTimer) {
    if (ack_task_handle != NULL) {
        xTaskNotifyGive(ack_task_handle);
    }
}

void ack_task(void *pvParameter) {
    while (1) {
        // Wait for timer notification
        ulTaskNotifyTake(pdTRUE, portMAX_DELAY);

        ESP_LOGI(TAG, "Broadcasting ACK message");
        send_ack(s_broadcast_mac);
    }
}

void ping_timer_callback(TimerHandle_t xTimer) {
    if (ping_task_handle != NULL) {
        xTaskNotifyGive(ping_task_handle);
    }
}

void ping_task(void *pvParameter) {
    for (;;) {
        ulTaskNotifyTake(pdTRUE, portMAX_DELAY);

        ESP_LOGI(TAG, "Sending pings");
        send_pings();
    }
}

void send_pings() {

}

static void wifi_event_handler(void* arg, esp_event_base_t event_base, int32_t event_id, void* event_data) {
    if (event_id == WIFI_EVENT_AP_STACONNECTED) {
        wifi_event_ap_staconnected_t* event = (wifi_event_ap_staconnected_t*) event_data;
        ESP_LOGI(TAG, "Station "MACSTR" joined, AID=%d", MAC2STR(event->mac), event->aid);
    } else if (event_id == WIFI_EVENT_AP_STADISCONNECTED) {
        wifi_event_ap_stadisconnected_t* event = (wifi_event_ap_stadisconnected_t*) event_data;
        ESP_LOGI(TAG, "Station "MACSTR" left, AID=%d", MAC2STR(event->mac), event->aid);
    } else if (event_id == WIFI_EVENT_AP_START) {
        ESP_LOGI(TAG, "WiFi soft AP started");
    } else if (event_id == WIFI_EVENT_AP_STOP) {
        ESP_LOGI(TAG, "WiFi soft AP stopped");
    }
}

static void wifi_init(void) {
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());

    esp_netif_create_default_wifi_sta();
    esp_netif_create_default_wifi_ap();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK( esp_wifi_init(&cfg) );
    ESP_ERROR_CHECK( esp_wifi_set_storage(WIFI_STORAGE_RAM) );

    ESP_ERROR_CHECK( esp_wifi_set_mode(WIFI_MODE_APSTA) );

    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, &wifi_event_handler, NULL));

    ESP_ERROR_CHECK( esp_wifi_start());
    ESP_ERROR_CHECK( esp_wifi_set_channel(1, WIFI_SECOND_CHAN_NONE));
    ESP_ERROR_CHECK( esp_wifi_set_protocol(WIFI_IF_STA, WIFI_PROTOCOL_11B|WIFI_PROTOCOL_11G|WIFI_PROTOCOL_11N|WIFI_PROTOCOL_LR) );
}

void espnow_send_cb(const esp_now_send_info_t *tx_info, esp_now_send_status_t status) {
    espnow_event_t evt;
    event_send_cb_t *send_cb = &evt.info.send_cb;

    if (tx_info == NULL) {
        ESP_LOGE(TAG, "Send cb arg error");
        return;
    }

    evt.id = ESPNOW_SEND_CB;
    memcpy(send_cb->mac_addr, tx_info->des_addr, ESP_NOW_ETH_ALEN);
    send_cb->status = status;
    if (xQueueSend(s_espnow_queue, &evt, ESPNOW_MAXDELAY) != pdTRUE) {
        ESP_LOGW(TAG, "Send send queue fail");
    }
}

void espnow_recv_cb(const esp_now_recv_info_t *recv_info, const uint8_t *data, int len) {
    espnow_event_t evt;
    event_recv_cb_t *recv_cb = &evt.info.recv_cb;
    uint8_t * mac_addr = recv_info->src_addr;

    if (mac_addr == NULL || data == NULL || len <= 0) {
        ESP_LOGE(TAG, "Receive cb arg error");
        return;
    }

    evt.id = ESPNOW_RECV_CB;
    memcpy(recv_cb->mac_addr, mac_addr, ESP_NOW_ETH_ALEN);
    recv_cb->data = malloc(len);
    if (recv_cb->data == NULL) {
        ESP_LOGE(TAG, "Malloc receive data fail");
        return;
    }
    memcpy(recv_cb->data, data, len);
    recv_cb->data_len = len;
    if (xQueueSend(s_espnow_queue, &evt, ESPNOW_MAXDELAY) != pdTRUE) {
        ESP_LOGW(TAG, "Send receive queue fail");
        free(recv_cb->data);
    }
}

int espnow_data_parse(uint8_t *data, uint16_t data_len, uint8_t *state, uint16_t *seq, int *magic) {
    espnow_data_t *buf = (espnow_data_t *)data;
    uint16_t crc, crc_cal = 0;

    if (data_len < sizeof(espnow_data_t)) {
        ESP_LOGE(TAG, "Receive ESPNOW data too short, len:%d", data_len);
        return -1;
    }

    *seq = buf->seq_num;
    crc = buf->crc;
    buf->crc = 0;
    crc_cal = esp_crc16_le(UINT16_MAX, (uint8_t const *)buf, data_len);

    // if (crc_cal == crc) {
    //     return buf->type;
    // }

    return buf->type;
}

void add_mac_to_list(const uint8_t *mac_addr) {
    if (mac_list.count >= MAX_MAC_ADDRESSES) {
        ESP_LOGW(TAG, "MAC address list is full");
        return;
    }

    if (is_mac_in_list(mac_addr)) {
        return;
    }

    memcpy(mac_list.mac_list[mac_list.count], mac_addr, ESP_NOW_ETH_ALEN);
    mac_list.count++;

    ESP_LOGI(TAG, "Added MAC to list: " MACSTR " (Total: %d)", MAC2STR(mac_addr), mac_list.count);
}

bool is_mac_in_list(const uint8_t *mac_addr) {
    for (int i = 0; i < mac_list.count; i++) {
        if (memcmp(mac_list.mac_list[i], mac_addr, ESP_NOW_ETH_ALEN) == 0) {
            return true;
        }
    }
    return false;
}

void send_ack(const uint8_t *dest_mac) {
    espnow_data_t *buf = malloc(sizeof(espnow_data_t));
    if (buf == NULL) {
        ESP_LOGE(TAG, "Malloc send buffer fail");
        return;
    }

    buf->type = ESPNOW_DATA_ACK;
    buf->seq_num = s_espnow_seq[ESPNOW_DATA_UNICAST]++;
    buf->crc = 0;
    buf->crc = esp_crc16_le(UINT16_MAX, (uint8_t const *)buf, sizeof(espnow_data_t));

    if (!esp_now_is_peer_exist(dest_mac)) {
        esp_now_peer_info_t peer;
        memset(&peer, 0, sizeof(esp_now_peer_info_t));
        peer.channel = 1;
        peer.ifidx = ESP_IF_WIFI_STA;
        peer.encrypt = false;
        memcpy(peer.peer_addr, dest_mac, ESP_NOW_ETH_ALEN);
        ESP_ERROR_CHECK(esp_now_add_peer(&peer));
    }

    esp_err_t ret = esp_now_send(dest_mac, (uint8_t *)buf, sizeof(espnow_data_t));
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Send ACK error: %s", esp_err_to_name(ret));
    } else {
        ESP_LOGI(TAG, "Sent ACK to " MACSTR, MAC2STR(dest_mac));
    }

    free(buf);
}

void ping() {
    espnow_data_t *buf = malloc(sizeof(espnow_data_t));
    buf->type = ESPNOW_DATA_PING;
    buf->len = 0;

    for (int i = 0; i < mac_list.count; i++) {
        esp_err_t ret = esp_now_send(mac_list.mac_list[i], (uint8_t *)buf, sizeof(espnow_data_t));
        if (ret != ESP_OK) {
            ESP_LOGE(TAG, "Send ping error: %s", esp_err_to_name(ret));
        } else {
            ESP_LOGI(TAG, "Sent ping to " MACSTR, MAC2STR(mac_list.mac_list[i]));
        }
    }
}

// void ack_timer_callback(TimerHandle_t xTimer) {
//     ESP_LOGI(TAG, "Broadcasting ACK message");
//
//     send_ack(s_broadcast_mac);
// }

void espnow_data_prepare(espnow_send_param_t *send_param) {
    espnow_data_t *buf = (espnow_data_t *)send_param->buffer;

    assert(send_param->len >= sizeof(espnow_data_t));

    buf->type = ESPNOW_DATA_REQUEST;
    buf->seq_num = s_espnow_seq[buf->type]++;
    buf->crc = 0;
    buf->crc = esp_crc16_le(UINT16_MAX, (uint8_t const *)buf, send_param->len);
}

void espnow_task(void *pvParameter) {
    espnow_event_t evt;
    uint8_t recv_state = 0;
    uint16_t recv_seq = 0;
    int recv_magic = 0;
    int ret;

    while (xQueueReceive(s_espnow_queue, &evt, portMAX_DELAY) == pdTRUE) {
        switch (evt.id) {
            case ESPNOW_SEND_CB:
            {
                event_send_cb_t *send_cb = &evt.info.send_cb;
                if (memcmp(send_cb->mac_addr, s_broadcast_mac, ESP_NOW_ETH_ALEN) == 0) {
                    ESP_LOGI(TAG, "Broadcast ACK sent, status: %d", send_cb->status);
                } else {
                    ESP_LOGI(TAG, "Unicast ACK sent to "MACSTR", status: %d", MAC2STR(send_cb->mac_addr), send_cb->status);
                }
                break;
            }
            case ESPNOW_RECV_CB:
            {
                event_recv_cb_t *recv_cb = &evt.info.recv_cb;
                espnow_data_t *packet = (espnow_data_t*)recv_cb->data;

                ret = espnow_data_parse(recv_cb->data, recv_cb->data_len, &recv_state, &recv_seq, &recv_magic);

                if (ret == ESPNOW_DATA_ACK) {
                    ESP_LOGI(TAG, "Received ACK from "MACSTR", seq: %d", MAC2STR(recv_cb->mac_addr), recv_seq);

                    add_mac_to_list(recv_cb->mac_addr);
                    char mac_string[18];
                    mac_to_string(recv_cb->mac_addr, mac_string);
                    addGate(mac_string);
                } else if (ret == ESPNOW_DATA_REQUEST) {
                    ESP_LOGI(TAG, "Received request from "MACSTR", seq: %d", MAC2STR(recv_cb->mac_addr), recv_seq);

                    size_t payload_len = packet->len;
                    if (payload_len > 0 && payload_len <= sizeof(packet->payload)) {
                        char* buffer = malloc(payload_len + 1);
                        if (buffer != NULL) {
                            memcpy(buffer, packet->payload, payload_len);
                            buffer[payload_len] = '\0';

                            ESP_LOGI(TAG, "Received data: %s", buffer);

                            char mac_addr_string[18];
                            mac_to_string(recv_cb->mac_addr, mac_addr_string);

                            addTime(mac_addr_string, buffer);

                            free(buffer);
                        } else {
                            ESP_LOGE(TAG, "Failed to allocate buffer for received data");
                        }
                    } else {
                        ESP_LOGE(TAG, "Invalid payload length: %zu", payload_len);
                    }
                } else if (ret == ESPNOW_DATA_PING) {
                    ESP_LOGI(TAG, "Received ping from "MACSTR"", MAC2STR(recv_cb->mac_addr));
                    int index = mac_index(recv_cb->mac_addr);
                    mac_list.lastPings[index] = esp_timer_get_time() * 1000;

                    for (int i = 0; i < mac_list.count; i++) {
                        if (esp_timer_get_time() * 1000 - mac_list.lastPings[i] > 30000) {
                            ESP_LOGW(TAG, "Lost gate: "MACSTR"", MAC2STR(recv_cb->mac_addr));
                        }
                    }
                } else {
                    ESP_LOGI(TAG, "Received invalid data from: "MACSTR"", MAC2STR(recv_cb->mac_addr));
                }

                free(recv_cb->data);
                break;
            }
            default:
                ESP_LOGE(TAG, "Callback type error: %d", evt.id);
                break;
        }
    }
}

int mac_index(const uint8_t *mac_addr) {
    uint8_t idx = 0;
    for (int i = 0; i < mac_list.count; i++) {
        if (mac_addr == mac_list.mac_list[i]) {
            return idx;
        }

        idx++;
    }

    return -1;
}

esp_err_t softap_init(void) {
    wifi_config_t wifi_ap_config = {
        .ap = {
            .ssid = SOFTAP_SSID,
            .ssid_len = strlen(SOFTAP_SSID),
            .channel = SOFTAP_CHANNEL,
            .password = SOFTAP_PASS,
            .max_connection = MAX_STA_CONN,
            .authmode = WIFI_AUTH_WPA2_PSK,
            .pmf_cfg = {
                .required = false,
            },
        },
    };

    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_AP, &wifi_ap_config));

    ESP_LOGI(TAG, "WiFi soft AP initialized. SSID:%s password:%s channel:%d",
             SOFTAP_SSID, SOFTAP_PASS, SOFTAP_CHANNEL);

    return ESP_OK;
}

esp_err_t espnow_init(void) {
    s_espnow_queue = xQueueCreate(ESPNOW_QUEUE_SIZE, sizeof(espnow_event_t));
    if (s_espnow_queue == NULL) {
        ESP_LOGE(TAG, "Create queue fail");
        return ESP_FAIL;
    }

    ESP_ERROR_CHECK( esp_now_init() );
    ESP_ERROR_CHECK( esp_now_register_send_cb(espnow_send_cb) );
    ESP_ERROR_CHECK( esp_now_register_recv_cb(espnow_recv_cb) );

    esp_now_peer_info_t *peer = malloc(sizeof(esp_now_peer_info_t));
    if (peer == NULL) {
        ESP_LOGE(TAG, "Malloc peer information fail");
        vQueueDelete(s_espnow_queue);
        esp_now_deinit();
        return ESP_FAIL;
    }
    memset(peer, 0, sizeof(esp_now_peer_info_t));
    peer->channel = 1;
    peer->ifidx = ESP_IF_WIFI_STA;
    peer->encrypt = false;
    memcpy(peer->peer_addr, s_broadcast_mac, ESP_NOW_ETH_ALEN);
    ESP_ERROR_CHECK( esp_now_add_peer(peer) );
    free(peer);

    ack_timer = xTimerCreate("ACK_Timer",
                            pdMS_TO_TICKS(ACK_TIMER_INTERVAL_MS),
                            pdTRUE,  // Auto-reload
                            NULL,    // Timer ID
                            ack_timer_callback);

    if (ack_timer == NULL) {
        ESP_LOGE(TAG, "Failed to create ACK timer");
        vQueueDelete(s_espnow_queue);
        esp_now_deinit();
        return ESP_FAIL;
    }

    if (xTimerStart(ack_timer, 0) != pdPASS) {
        ESP_LOGE(TAG, "Failed to start ACK timer");
        xTimerDelete(ack_timer, 0);
        vQueueDelete(s_espnow_queue);
        esp_now_deinit();
        return ESP_FAIL;
    }

    ESP_LOGI(TAG, "ACK timer started - will send ACKs every %d seconds", ACK_TIMER_INTERVAL_MS/1000);

    xTaskCreate(espnow_task, "espnow_task", 2048, NULL, 4, NULL);

    ping_timer = xTimerCreate("PING_Timer", pdMS_TO_TICKS(PING_TIMER_INTERVAL_MS), pdTRUE, NULL, );

    return ESP_OK;
}

void espnow_deinit(espnow_send_param_t *send_param) {
    if (ack_timer != NULL) {
        xTimerStop(ack_timer, 0);
        xTimerDelete(ack_timer, 0);
    }
    if (send_param != NULL) {
        free(send_param->buffer);
        free(send_param);
    }
    vQueueDelete(s_espnow_queue);
    esp_now_deinit();
}

void app_main(void) {
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK( nvs_flash_erase() );
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK( ret );

    wifi_init();
    xTaskCreate(ack_task, "ack_task", 3072, NULL, 3, &ack_task_handle);
    softap_init();
    espnow_init();
    xTaskCreatePinnedToCore(server_start, "server", 4098, NULL, 4, NULL, 1);
}
