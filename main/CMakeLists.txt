idf_component_register(SRCS "ESP32_Receiver.c" "server.c" "hash.c"
                    INCLUDE_DIRS "."
                    EMBED_FILES "../frontend/dist/index.html"
                                "../frontend/dist/assets/index.css"
                                "../frontend/dist/assets/index.js")
