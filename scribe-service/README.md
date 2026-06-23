# scribe-service

Gerador de **ata de reunião com IA**. Recebe uma transcrição rotulada por participante, sintetiza o conteúdo via LLM e devolve a ata estruturada. No MVP a saída é texto; em seguida passa a gerar PDF via `report-service`.

---

## Stack

| Camada           | Tecnologia                                              |
| ---------------- | ------------------------------------------------------- |
| Linguagem        | Java 17                                                 |
| Build            | Maven                                                   |
| Framework        | Spring Boot 3.4.1                                       |
| IA               | Spring AI 1.0.0 (provider abstraído por variável de ambiente) |
| Providers de LLM | OpenAI (GPT-4o) · Ollama (local, sem custo)            |
| Spec/Docs        | SpringDoc OpenAPI 2.8.9 + Swagger UI                   |
| Logs             | SLF4J + Logback + Logstash Encoder (JSON em `prod`)    |
| Métricas         | Micrometer via Spring Boot Actuator (em memória)        |
| Containerização  | Jib (build Docker sem Dockerfile)                       |
| "Frontend" MVP   | Postman Collection versionada                           |

---

## Escopo do MVP (v1 — texto)

```
Postman → POST /atas  (transcrição rotulada)
        → scribe-service  (LLM sintetiza)
        → resposta: ATA em TEXTO
```

**Entra:** texto já transcrito e identificado por pessoa, formato:

```
Ana: precisamos fechar o orçamento do Q3 até sexta.
Bruno: consigo o número da infra hoje à tarde.
Ana: ótimo, então sexta a gente revisa junto.
```

> A diarização (separar quem falou) é feita **fora** da API nesta fase. A API assume o texto já rotulado.

**Sai:** ata em texto, derivada de um schema interno (abaixo), serializado de forma legível.

---

## Contrato da ata (schema interno)

Mesmo no MVP-texto, a LLM produz contra uma estrutura-alvo. Isso garante consistência e prepara a v2 (PDF).

```json
{
  "title": "string",
  "date": "ISO-8601",
  "participants": ["string"],
  "agenda": ["string"],
  "discussion": ["string"],
  "decisions": ["string"],
  "actionItems": [
    { "owner": "string", "task": "string", "due": "ISO-8601 | null" }
  ],
  "nextSteps": ["string"]
}
```

Na v1 esse objeto é renderizado como texto. Na v2 é o payload enviado ao `report-service`.

---

## API

| Método | Rota                                              | Descrição                          |
| ------ | ------------------------------------------------- | ---------------------------------- |
| `POST` | `/atas`                                           | Recebe transcrição, retorna ata    |
| `GET`  | `/actuator/health`                                | Health check                       |
| `GET`  | `/actuator/metrics`                               | Lista todas as métricas            |
| `GET`  | `/actuator/metrics/scribe.ai.call.duration`       | Tempo de resposta do modelo (IA)   |
| `GET`  | `/actuator/metrics/scribe.ata.request.duration`   | Tempo end-to-end do request        |
| `GET`  | `/actuator/metrics/scribe.ata.requests.total`     | Total de requisições recebidas     |
| `GET`  | `/actuator/metrics/scribe.ai.tokens.prompt`       | Tokens de prompt consumidos        |
| `GET`  | `/actuator/metrics/scribe.ai.tokens.completion`   | Tokens de completion gerados       |
| `GET`  | `/swagger-ui.html`                                | Documentação interativa            |

**Request:**

```json
{
  "transcript": "Ana: ...\nBruno: ...",
  "title": "Reunião de planejamento Q3"
}
```

**Response (v1):** `text/plain` — ata formatada.

---

## Observabilidade

### Logs

Padrão: `<método> | descrição [variável]`

```
sintetizar | Modelo [llama3.2] respondeu em [4231ms] — tokens: prompt=[312], completion=[891], total=[1203]
gerarAta   | Ata gerada com sucesso para título [Reunião Q3] — [2847] caracteres em [4235ms] (end-to-end)
```

| Perfil        | Formato                  | Como ativar                             |
| ------------- | ------------------------ | --------------------------------------- |
| padrão / dev  | Console colorido legível | comportamento padrão                    |
| `prod`        | JSON estruturado (Logstash / ELK) | `-Dspring.profiles.active=prod` |

Nível `DEBUG` ativo no perfil dev — inclui tamanho do prompt enviado ao modelo e detalhes de processamento.

### Métricas

Ficam **em memória** (acumuladas desde o último startup). Não persistem entre reinicios.

Cada métrica acumula `COUNT`, `TOTAL_TIME` e `MAX`. Exemplo: `scribe.ai.call.duration` com 35s é o tempo que o modelo levou para gerar a ata — normal para LLMs gerando texto longo.

Para persistência, integrar com **Prometheus + Grafana** (Micrometer tem suporte nativo; basta adicionar a dependência `micrometer-registry-prometheus` e expor `/actuator/prometheus`).

---

## Estrutura do projeto

```
scribe-service/
├── src/main/java/.../
│   ├── controller/
│   │   ├── AtaController.java      # endpoint POST /atas, timer end-to-end
│   │   └── AiErrorHandler.java     # tratamento de erros da IA
│   ├── service/
│   │   └── AtaSynthesisService.java  # prompt + chamada ao modelo + métricas de tokens
│   └── model/
│       ├── AtaRequest.java
│       ├── Ata.java
│       └── ActionItem.java
├── src/main/resources/
│   ├── application.yml
│   └── logback-spring.xml          # console dev / JSON prod
├── openapi/
│   └── scribe.postman_collection.json
├── pom.xml
└── README.md
```

---

## Como rodar

```bash
mvn spring-boot:run
```

### Com OpenAI (GPT-4o)

1. Crie/acesse uma conta em [platform.openai.com](https://platform.openai.com).
2. Em **Settings → Billing**, adicione um método de pagamento (pay-as-you-go, sem créditos gratuitos em contas novas).
3. Em [platform.openai.com/api-keys](https://platform.openai.com/api-keys), crie uma chave e copie o valor.
4. Defina a variável antes de rodar:
   - PowerShell: `$env:SPRING_AI_OPENAI_API_KEY = "sk-..."`
   - IntelliJ Run Config: adicione `SPRING_AI_OPENAI_API_KEY=sk-...` em *Environment variables*

Sem a variável, a app usa o placeholder `changeme`, a OpenAI rejeita com `401` e a API devolve uma mensagem clara (sem stacktrace).

### Com Ollama (local, sem custo)

1. Instale o [Ollama](https://ollama.com/download).
2. Baixe o modelo: `ollama pull llama3.2`
3. Garanta que o Ollama está rodando em `http://localhost:11434` (`ollama serve` — normalmente já fica ativo após a instalação).
4. Rode apontando para o Ollama:
   - PowerShell: `$env:SPRING_AI_MODEL_CHAT = "ollama"; mvn spring-boot:run`
   - IntelliJ: defina `SPRING_AI_MODEL_CHAT=ollama` em *Environment variables*

Para usar outro modelo: `SPRING_AI_OLLAMA_MODEL=mistral`
Para usar outro host: `SPRING_AI_OLLAMA_BASE_URL=http://outro-host:11434`
Para voltar à OpenAI: remover `SPRING_AI_MODEL_CHAT` (padrão é `openai`).

### Modelo Ollama em uso: llama3.2

| Propriedade      | Valor                                                        |
| ---------------- | ------------------------------------------------------------ |
| Parâmetros       | 3.2 bilhões (modelo pequeno/médio)                          |
| Context window   | 131 072 tokens (~100 000 palavras)                          |
| Quantização      | Q4_K_M — pesos comprimidos de 16-bit para ~4-bit; cabe em RAM normal com pequena perda de qualidade |
| Tamanho em disco | 2 GB                                                         |
| Capacidades      | completion, tool calls                                       |
| Licença          | Llama 3.2 Community License (Meta)                          |

#### Restrições de uso comercial/interno do Llama 3.2

**Permitido sem restrições para uso empresarial interno:**
- Uso interno em qualquer empresa (geração de atas, automação de processos, etc.)
- Uso comercial em produtos e serviços
- Criar derivados e redistribuir
- Empresas sediadas na UE — **o modelo texto não tem restrição de uso na UE** (a restrição europeia aplica-se apenas aos modelos multimodais/visão, que não estão em uso aqui)

**Restrições a ter em conta:**
- **Empresas com mais de 700 milhões de utilizadores ativos mensais** precisam de uma licença separada concedida pela Meta. Abaixo desse limiar, o uso é livre.
- Os outputs do modelo não podem ser usados para treinar modelos concorrentes da Meta.
- É obrigatório incluir o aviso de copyright da Meta em cópias redistribuídas do modelo.
- Deve-se cumprir a [Acceptable Use Policy](https://www.llama.com/llama3_2/use-policy): proibido gerar conteúdo prejudicial, conselho médico/legal/financeiro não autorizado, ou processar dados pessoais sem base legal adequada.

**Conclusão para uso interno empresarial típico:** sem restrições práticas, exceto o limite de 700M MAU.

---

## Roadmap

### v1 — MVP (atual)

- [x] Entrada: transcrição rotulada
- [x] Síntese via LLM (OpenAI ou Ollama)
- [x] Saída em texto
- [x] Logs estruturados com tempos e tokens
- [x] Métricas via Actuator (duração, tokens, requests)
- [x] Collection Postman em `/openapi/`

### v2 — PDF

- [ ] LLM produz a ata como **JSON estruturado** (schema acima)
- [ ] Integração com `report-service` → PDF formatado
- [ ] API devolve o PDF para a collection

### v3 — Captura de voz

- [ ] Áudio capturado no frontend (device ou arquivo)
- [ ] Transcrição + diarização (definir: serviço externo vs. processamento próprio)
- [ ] Texto rotulado alimenta o fluxo já existente

---

## Decisões em aberto

| Tema          | A decidir                                           |
| ------------- | --------------------------------------------------- |
| Provider de IA | Anthropic / OpenAI / Ollama local                 |
| Diarização    | onde acontece e com qual serviço (v3)               |
| Persistência  | se as atas serão armazenadas ou stateless           |
| Métricas      | integrar Prometheus + Grafana para persistência     |
