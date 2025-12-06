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

void hashtable_insert(struct HashTable *table, const char *key, const char *value) {
    if (table == NULL || key == NULL) {
        return;
    }

    int index = key_hash(key);
    table->bucket[index] = strdup(key);
    table->values[index] = strdup(value);
}

const char *hashtable_get(struct HashTable *table, char *key) {
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