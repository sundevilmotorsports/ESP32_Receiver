#ifndef ESP32_RECEIVER_ESP32_RECEIVER_H
#define ESP32_RECEIVER_ESP32_RECEIVER_H

#define MAX_MAC_ADDRESSES 50
#define ESPNOW_MAXDELAY 512
#define SOFTAP_SSID "SDM Telemetry"
#define SOFTAP_PASS "244466666"
#define SOFTAP_CHANNEL 1
#define MAX_STA_CONN 4

#include "esp_now.h"

typedef enum {
    ESPNOW_SEND_CB,
    ESPNOW_RECV_CB,
} event_id_t;

typedef enum {
    ESPNOW_DATA_ACK,
    ESPNOW_DATA_REQUEST,
    ESPNOW_DATA_PING,
    ESPNOW_GATE_IDENT,
    ESPNOW_TELEMETRY,
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

typedef struct __attribute__((packed)) {
    uint8_t  type;
    uint16_t seq_num;
    uint16_t crc;
    uint8_t  len;
    uint8_t  data[200];
} espnow_data_t;

/* MAC address list structure */
typedef struct {
    uint8_t mac_list[MAX_MAC_ADDRESSES][ESP_NOW_ETH_ALEN];
    int64_t lastPings[MAX_MAC_ADDRESSES];
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

static uint16_t s_espnow_seq[ESPNOW_DATA_MAX] = { 0, 0 };

static const struct { uint8_t id; uint8_t len; const char* name; } segments[] = {
    { 0x01, 1, "drs"       },
    { 0x02, 6, "imu_gyro"  },
    { 0x03, 6, "imu_accel" },
    { 0x04, 6, "wheel_fl"  },
    { 0x05, 6, "wheel_fr"  },
    { 0x06, 6, "wheel_rr"  },
    { 0x07, 6, "wheel_rl"  },
    { 0x08, 2, "sg_fl"     },
    { 0x09, 2, "sg_fr"     },
    { 0x0A, 2, "sg_rr"     },
    { 0x0B, 2, "sg_rl"     },
    { 0x0C, 3, "eng_f0"    },
    { 0x0D, 3, "eng_f1"    },
    { 0x0E, 1, "eng_f2"    },
    { 0x0F, 3, "shifter"   },
};
static const int NUM_SEGMENTS = sizeof(segments) / sizeof(segments[0]);

void espnow_deinit(espnow_send_param_t *send_param);
esp_err_t espnow_init(void);
void espnow_send_cb(const esp_now_send_info_t *tx_info, esp_now_send_status_t status);
void espnow_recv_cb(const esp_now_recv_info_t *recv_info, const uint8_t *data, int len);
mac_address_list_t* get_mac_list(void);
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