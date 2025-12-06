#ifndef ESP32_RECEIVER_HASH_H
#define ESP32_RECEIVER_HASH_H

#include <stdbool.h>

int key_hash(char *key);
bool key_equals(char *key, char *other);

struct HashTable {
    int size;           // Size of bucket array
    char **bucket;      // Array of pointers to keys/values
    char **values;      // Array of pointers to strings
};

struct HashTable hashtable_create();

void hashtable_insert(struct HashTable *table, const char *key, const char *value);
const char *hashtable_get(struct HashTable *table, char *key);
char** hashtable_list_keys(struct HashTable *table);

#endif //ESP32_RECEIVER_HASH_H