// Formatos trocados com a API e com o computador: hora ISO-8601, JSON da janela, leitura da
// resposta, política de reenvio e quadro binário do sinal bruto. Lógica pura.
#pragma once

#include <stddef.h>
#include <stdint.h>

namespace ps {

// ---------------------------------------------------------------- hora

// "2026-11-11T12:00:00.123456Z" a partir de microssegundos desde 1970 (UTC). buf >= 28 bytes.
// Devolve o número de caracteres escritos (27).
int formatarIso(uint64_t epochUs, char* buf, size_t tamanho);

// Lê "AAAA-MM-DDTHH:MM:SS[.fração](Z|+00:00|-03:00)". Fração de 0 a 9 dígitos (guarda até µs).
bool lerIso(const char* texto, uint64_t* epochUs);

// ---------------------------------------------------------------- janela

static const int MAX_PONTOS = 3;

struct MedidaPonto {
  bool presente;
  float rmsG, picoG, curtose, o1x, o2x, o3x;
};

// O que vai para a API (e para a fila). POD de tamanho fixo: é gravado como está no LittleFS.
struct DadosJanela {
  uint8_t versao;          // formato do registro na fila
  uint8_t modoRapido;      // 1 = janela de 1 s
  uint8_t saturou;
  uint8_t reservado;
  uint64_t inicioUs;       // medido_em: início da janela, µs desde 1970 (UTC)
  float rotacaoRpm;
  uint32_t amostras;       // menor contagem entre os sensores presentes
  uint32_t amostrasEsperadas;
  MedidaPonto pontos[MAX_PONTOS];  // A, B, C
};

static const uint8_t VERSAO_DADOS_JANELA = 1;
extern const char* const CODIGOS_PONTOS[MAX_PONTOS];

// JSON do POST /api/v1/telemetria (docs/payload.md). Devolve o tamanho, ou 0 se não coube.
// Pontos ausentes ficam fora do JSON (a API aceita de 1 a 3).
size_t montarJson(const DadosJanela& j, const char* dispositivo, char* buf, size_t tamanho);

// Procura "modo_rapido_ate" na resposta. Devolve true e o instante se o campo existe e é válido.
bool lerModoRapidoAte(const char* json, uint64_t* epochUs);

// ---------------------------------------------------------------- envio

enum class Decisao {
  SUCESSO,        // 2xx (201 nova, 200 reenvio): remove da fila
  DESCARTAR,      // 400, 403, 413, 422: erro de programação, registra e descarta, sem reenviar
  CHAVE_INVALIDA, // 401: para de enviar e avisa na tela
  REENVIAR        // 5xx, 408, 429, falha de conexão (código <= 0) e o resto: tenta de novo a mesma janela
};

Decisao decidir(int codigoHttp);

// Espera antes da tentativa número `falhas` seguidas (1, 2, 3...): 1, 2, 4, 8, 16, 32 s e depois 60 s.
uint32_t esperaReenvioMs(uint32_t falhas);

// ---------------------------------------------------------------- sinal bruto (serial)

// CRC-16/CCITT-FALSE (polinômio 0x1021, valor inicial 0xFFFF, sem reflexão)
uint16_t crc16(const uint8_t* dados, size_t n, uint16_t inicial = 0xFFFF);

// Quadro binário de um tick de aquisição (little-endian):
//   0xA5 0x5A | tipo=0x01 | seq (u8) | t_us (u32) | ir (u8) | nA nB nC (u8) |
//   amostras de A, depois B, depois C: n x (x, y, z em i16) | CRC-16 (u16) de tipo até a última amostra
static const uint8_t QUADRO_SINC_1 = 0xA5;
static const uint8_t QUADRO_SINC_2 = 0x5A;
static const uint8_t QUADRO_TIPO_AMOSTRAS = 0x01;
static const int QUADRO_MAX_POR_SENSOR = 33;  // 32 da FIFO + o registro de saída
static const size_t QUADRO_CABECALHO = 2 + 1 + 1 + 4 + 1 + 3;
static const size_t QUADRO_MAX = QUADRO_CABECALHO + 3 * QUADRO_MAX_POR_SENSOR * 6 + 2;

// amostras[s] aponta para n[s] * 3 valores (x, y, z); devolve o tamanho do quadro ou 0 se não coube
size_t montarQuadro(uint8_t seq, uint32_t tUs, uint8_t ir, const uint8_t n[3], const int16_t* const amostras[3],
                    uint8_t* buf, size_t tamanho);

}  // namespace ps
