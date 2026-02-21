#include "hash.h"
#include <stdlib.h>
#include <string.h>

#define TABLE_SIZE 100

static int key_hash(const char *key) {
    unsigned int hash = 0;
    while (*key) hash = (hash * 31) + (*key++);
    return (int)(hash % TABLE_SIZE);
}

struct HashTable hashtable_create() {
    struct HashTable table;
    table.size = TABLE_SIZE;
    table.bucket = calloc(TABLE_SIZE, sizeof(char*));
    table.values = calloc(TABLE_SIZE, sizeof(char*));
    return table;
}

void hashtable_insert(struct HashTable *table, const char *key, const char *value) {
    if (!table || !key) return;

    int index = key_hash(key);

    // Linear probe: find existing slot for this key, or first empty slot
    for (int i = 0; i < TABLE_SIZE; i++) {
        int slot = (index + i) % TABLE_SIZE;

        if (table->bucket[slot] == NULL) {
            // Empty slot
            table->bucket[slot] = strdup(key);
            table->values[slot] = strdup(value);
            return;
        }

        if (strcmp(table->bucket[slot], key) == 0) {
            // Key already exists
            free(table->values[slot]);
            table->values[slot] = strdup(value);
            return;
        }
    }
}

const char *hashtable_get(struct HashTable *table, char *key) {
    if (!table || !key) return NULL;

    int index = key_hash(key);

    for (int i = 0; i < TABLE_SIZE; i++) {
        int slot = (index + i) % TABLE_SIZE;
        if (table->bucket[slot] == NULL) return NULL;
        if (strcmp(table->bucket[slot], key) == 0) return table->values[slot];
    }

    return NULL;
}

char** hashtable_list_keys(struct HashTable *table) {
    return table->bucket;
}