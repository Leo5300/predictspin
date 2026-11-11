#include "AlertaLocal.h"

namespace ps {

AlertaLocal::AlertaLocal(uint8_t janelasAprendizado, float fator, uint8_t persistencia)
    : janelasAprendizado_(janelasAprendizado ? janelasAprendizado : 1), fator_(fator), persistencia_(persistencia) {}

void AlertaLocal::reaprender() {
  aprendidas_ = 0;
  soma_ = 0.0;
  referencia_ = 0.0f;
  seguidas_ = 0;
  estado_ = EstadoAlerta::APRENDENDO;
}

EstadoAlerta AlertaLocal::atualizar(float rmsG) {
  if (aprendidas_ < janelasAprendizado_) {
    soma_ += rmsG;
    aprendidas_++;
    if (aprendidas_ == janelasAprendizado_) {
      referencia_ = (float)(soma_ / janelasAprendizado_);
      estado_ = EstadoAlerta::NORMAL;
    }
    return estado_;
  }
  // Referência zero (sensor parado durante o aprendizado) não serve para comparar: fica normal
  if (referencia_ <= 0.0f || rmsG <= fator_ * referencia_) {
    seguidas_ = 0;
    estado_ = EstadoAlerta::NORMAL;
  } else {
    if (seguidas_ < 255) seguidas_++;
    estado_ = seguidas_ >= persistencia_ ? EstadoAlerta::ALARME : EstadoAlerta::ATENCAO;
  }
  return estado_;
}

}  // namespace ps
