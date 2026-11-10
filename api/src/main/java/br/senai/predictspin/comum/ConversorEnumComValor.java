package br.senai.predictspin.comum;

import jakarta.persistence.AttributeConverter;

/** Converte um {@link EnumComValor} para a coluna de texto e de volta. */
public abstract class ConversorEnumComValor<E extends Enum<E> & EnumComValor> implements AttributeConverter<E, String> {

    private final Class<E> tipo;

    protected ConversorEnumComValor(Class<E> tipo) {
        this.tipo = tipo;
    }

    @Override
    public String convertToDatabaseColumn(E atributo) {
        return atributo == null ? null : atributo.valor();
    }

    @Override
    public E convertToEntityAttribute(String coluna) {
        return EnumComValor.de(tipo, coluna);
    }
}
