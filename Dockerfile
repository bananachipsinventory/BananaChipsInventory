FROM eclipse-temurin:17-jdk
WORKDIR /app
COPY . .
RUN javac --add-modules jdk.httpserver Main.java
CMD ["java", "--add-modules", "jdk.httpserver", "Main"]
