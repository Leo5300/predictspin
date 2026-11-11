// Indicação local de vibração por ponto: aprende o RMS normal nas primeiras janelas e compara as
// seguintes com ele. É só sinalização na bancada (tela e LEDs); o alarme oficial será da API.
#pragma once

#include <stdint.h>

namespace ps {

enum class EstadoAlerta : uint8_t { APRENDENDO, NORMAL, ATENCAO, ALARME };

class AlertaLocal {
 public:
  // janelasAprendizado: quantas janelas formam a referência; fator: RMS acima de fator x referência
  // é atenção; persistencia: janelas seguidas em atenção para virar alarme.
  AlertaLocal(uint8_t janelasAprendizado = 16, float fator = 1.6f, uint8_t persistencia = 3);

  // Uma janela nova do ponto. Devolve o estado depois dela.
  EstadoAlerta atualizar(float rmsG);
  void reaprender();

  EstadoAlerta estado() const { return estado_; }
  float referencia() const { return referencia_; }
  uint8_t progresso() const { return aprendidas_; }  // janelas já aprendidas
  uint8_t janelasAprendizado() const { return janelasAprendizado_; }

 private:
  uint8_t janelasAprendizado_;
  float fator_;
  uint8_t persistencia_;
  uint8_t aprendidas_ = 0;
  double soma_ = 0.0;
  float referencia_ = 0.0f;
  uint8_t seguidas_ = 0;
  EstadoAlerta estado_ = EstadoAlerta::APRENDENDO;
};

}  // namespace ps
