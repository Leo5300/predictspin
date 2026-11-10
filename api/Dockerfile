# syntax=docker/dockerfile:1

# --- Estágio 1: compilação ---------------------------------------------------
FROM eclipse-temurin:21-jdk AS build
WORKDIR /build

# Dependências primeiro, para aproveitar o cache de camadas
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN chmod +x mvnw && ./mvnw -B -q dependency:go-offline

COPY src/ src/
RUN ./mvnw -B -q package -DskipTests

# --- Estágio 2: execução -----------------------------------------------------
FROM eclipse-temurin:21-jre
WORKDIR /app

RUN groupadd --system app && useradd --system --gid app --no-create-home app
COPY --from=build /build/target/predictspin-api.jar app.jar
USER app

# Padrão pensado para instância pequena (512 MB): heap limitado a uma fração da memória do
# contêiner, coletor serial (menos memória extra) e metaspace limitado. Sobrescreva com JAVA_OPTS.
ENV JAVA_OPTS="-XX:MaxRAMPercentage=60 -XX:+UseSerialGC -XX:MaxMetaspaceSize=160m -Xss512k -XX:+ExitOnOutOfMemoryError"
ENV PORT=8080
EXPOSE 8080

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
