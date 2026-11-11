// Modelo dos segredos do firmware. Copie para include/segredos.h (que fica fora do Git) e preencha.
//   copy include\segredos.exemplo.h include\segredos.h
// Nunca coloque valores reais neste arquivo.
#pragma once

// Até duas redes Wi-Fi, tentadas na ordem (escola e hotspot do celular). Deixe a segunda vazia ("")
// se não houver. Rede com página de login (portal cativo) não funciona.
#define WIFI_REDE_1 "nome-da-rede-1"
#define WIFI_SENHA_1 "senha-da-rede-1"
#define WIFI_REDE_2 ""
#define WIFI_SENHA_2 ""

// Endereço da API, sem barra no fim (o firmware acrescenta /api/v1/telemetria)
#define API_URL "https://SEU-SERVICO.onrender.com"

// Identificador e chave do dispositivo: a chave é a DISPOSITIVO_TORNO_CHAVE configurada na API
#define DISPOSITIVO_ID "ps-torno-01"
#define DISPOSITIVO_CHAVE "cole-aqui-a-chave-do-dispositivo"
