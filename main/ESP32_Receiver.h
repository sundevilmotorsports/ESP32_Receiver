#ifndef ESP32_RECEIVER_ESP32_RECEIVER_H
#define ESP32_RECEIVER_ESP32_RECEIVER_H

#define MAX_MAC_ADDRESSES 50
#define ESPNOW_MAXDELAY 512
#define SOFTAP_SSID "Timing Gate"
#define SOFTAP_PASS "244466666"
#define SOFTAP_CHANNEL 1
#define MAX_STA_CONN 4

#include "esp_now.h"

static const char *TAG = "espnow_receiver";

typedef enum {
    ESPNOW_SEND_CB,
    ESPNOW_RECV_CB,
} event_id_t;

typedef enum {
    ESPNOW_DATA_ACK,
    ESPNOW_DATA_REQUEST,
    ESPNOW_DATA_PING,
} espnow_msg_type_t;

typedef enum {
    ESPNOW_DATA_BROADCAST,
    ESPNOW_DATA_UNICAST,
    ESPNOW_DATA_MAX,
} espnow_data_type_t;

typedef struct {
    uint8_t mac_addr[ESP_NOW_ETH_ALEN];
    esp_now_send_status_t status;
} event_send_cb_t;

typedef struct {
    uint8_t mac_addr[ESP_NOW_ETH_ALEN];
    uint8_t *data;
    int data_len;
} event_recv_cb_t;

typedef union {
    event_send_cb_t send_cb;
    event_recv_cb_t recv_cb;
} event_info_t;

typedef struct {
    event_id_t id;
    event_info_t info;
} espnow_event_t;

typedef struct {
    espnow_msg_type_t type;               // ACK or Request type
    uint16_t seq_num;                     //Sequence number of ESPNOW data.
    uint16_t crc;                         //CRC16 value of ESPNOW data.
    size_t len;
    uint8_t payload[1430];                   //Real payload of ESPNOW data.
} __attribute__((packed)) espnow_data_t;

/* MAC address list structure */
typedef struct {
    uint8_t mac_list[MAX_MAC_ADDRESSES][ESP_NOW_ETH_ALEN];
    int64_t *lastPings;
    int count;
} mac_address_list_t;

typedef struct {
    bool unicast;                         //Send unicast ESPNOW data.
    bool broadcast;                       //Send broadcast ESPNOW data.
    uint8_t state;                        //Indicate that if has received broadcast ESPNOW data or not.
    int len;                              //Length of ESPNOW data to be sent, unit: byte.
    uint8_t *buffer;                      //Buffer pointing to ESPNOW data.
    uint8_t dest_mac[ESP_NOW_ETH_ALEN];   //MAC address of destination device.
} espnow_send_param_t;

void espnow_deinit(espnow_send_param_t *send_param);
esp_err_t espnow_init(void);
void espnow_send_cb(const esp_now_send_info_t *tx_info, esp_now_send_status_t status);
void espnow_recv_cb(const esp_now_recv_info_t *recv_info, const uint8_t *data, int len);
void espnow_task(void *pvParameter);
int espnow_data_parse(uint8_t *data, uint16_t data_len, uint8_t *state, uint16_t *seq, int *magic);
void espnow_data_prepare(espnow_send_param_t *send_param);
void add_mac_to_list(const uint8_t *mac_addr);
bool is_mac_in_list(const uint8_t *mac_addr);
void send_ack(const uint8_t *dest_mac);
esp_err_t softap_init(void);
int mac_index(const uint8_t *mac_addr);
void send_pings();

#endif //ESP32_RECEIVER_ESP32_RECEIVER_H