#include "hash.h"
#include <stdlib.h>
#include <string.h>

#define TABLE_SIZE 100

int key_hash(char *key) {
    unsigned int hash = 0;
    while (*key) {
        hash = (hash * 31) + (*key++);
    }
    return hash % TABLE_SIZE;
}

bool key_equals(char *key, char *other) {
    return strcmp(key, other) == 0;
}

struct HashTable hashtable_create() {
    struct HashTable table;
    table.size = TABLE_SIZE;
    table.bucket = calloc(TABLE_SIZE, sizeof(char*));
    table.values = calloc(TABLE_SIZE, sizeof(struct GateData*));
    return table;
}

void hashtable_insert(struct HashTable *table, char *key, struct GateData *value) {
    if (table == NULL || key == NULL) {
        return;
    }

    int index = key_hash(key);
    table->bucket[index] = strdup(key);

    // Free existing GateData if it exists
    if (table->values[index] != NULL) {
        if (table->values[index]->timestamp != NULL) {
            free(table->values[index]->timestamp);
        }
        if (table->values[index]->time_delta != NULL) {
            free(table->values[index]->time_delta);
        }
        free(table->values[index]);
    }

    // Allocate new GateData and copy values
    table->values[index] = malloc(sizeof(struct GateData));
    table->values[index]->timestamp = value && value->timestamp ? strdup(value->timestamp) : NULL;
    table->values[index]->time_delta = value && value->time_delta ? strdup(value->time_delta) : NULL;
}

struct GateData *hashtable_get(struct HashTable *table, char *key) {
    if (table == NULL || key == NULL) {
        return NULL;
    }

    int index = key_hash(key);
    if (table->bucket[index] != NULL && key_equals(table->bucket[index], key)) {
        return table->values[index];
    }

    return NULL;
}

char** hashtable_list_keys(struct HashTable *table) {
    return table->bucket;
}