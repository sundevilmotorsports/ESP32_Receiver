#ifndef ESP32_RECEIVER_HASH_H
#define ESP32_RECEIVER_HASH_H

#include <stdbool.h>

struct GateData {
    char* timestamp;
    char* time_delta;
};

int key_hash(char *key);
bool key_equals(char *key, char *other);

struct HashTable {
    int size;           // Size of bucket array
    char **bucket;      // Array of pointers to keys/values
    struct GateData **values;      // Array of pointers to GateData structures
};

struct HashTable hashtable_create();

void hashtable_insert(struct HashTable *table, char *key, struct GateData *value);
struct GateData *hashtable_get(struct HashTable *table, char *key);
char** hashtable_list_keys(struct HashTable *table);

#endif //ESP32_RECEIVER_HASH_H