package com.multicert.components.scribeservice.controller;

import com.multicert.components.scribeservice.model.AtaRequest;
import com.multicert.components.scribeservice.service.AtaSynthesisService;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/atas")
@Tag(name = "Atas", description = "Geração de ata de reunião via IA")
public class AtaController {

    private static final Logger log = LoggerFactory.getLogger(AtaController.class);

    private final AtaSynthesisService synthesisService;
    private final MeterRegistry meterRegistry;
    private final Counter requestCounter;

    public AtaController(AtaSynthesisService synthesisService, MeterRegistry meterRegistry) {
        this.synthesisService = synthesisService;
        this.meterRegistry = meterRegistry;
        this.requestCounter = Counter.builder("scribe.ata.requests.total")
                .description("Total de requisições de geração de ata")
                .register(meterRegistry);
    }

    @PostMapping(
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.TEXT_PLAIN_VALUE
    )
    @Operation(
            summary = "Gera ata a partir de transcrição rotulada",
            requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(
                    content = @Content(
                            schema = @Schema(implementation = AtaRequest.class),
                            examples = @ExampleObject(value = """
                                    {
                                      "title": "Reunião de planejamento Q3",
                                      "transcript": "Ana: precisamos fechar o orçamento do Q3 até sexta.\\nBruno: consigo o número da infra hoje à tarde.\\nAna: ótimo, então sexta a gente revisa junto."
                                    }
                                    """)
                    )
            ),
            responses = @ApiResponse(
                    responseCode = "200",
                    description = "Ata gerada em texto",
                    content = @Content(mediaType = MediaType.TEXT_PLAIN_VALUE)
            )
    )
    public String gerarAta(@Valid @RequestBody AtaRequest request) {
        requestCounter.increment();

        log.info("gerarAta | Requisição recebida para título [{}], transcrição com [{}] caracteres — total acumulado [{}] req",
                request.title(), request.transcript().length(), (long) requestCounter.count());

        Timer.Sample sample = Timer.start(meterRegistry);

        String ata = synthesisService.sintetizar(request);

        long tempoNs = sample.stop(meterRegistry.timer("scribe.ata.request.duration", "endpoint", "gerarAta"));
        long tempoMs = TimeUnit.NANOSECONDS.toMillis(tempoNs);

        log.info("gerarAta | Ata gerada com sucesso para título [{}] — [{}] caracteres em [{}ms] (end-to-end)",
                request.title(), ata.length(), tempoMs);

        return ata;
    }
}
