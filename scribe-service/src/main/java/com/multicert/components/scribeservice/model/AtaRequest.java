package com.multicert.components.scribeservice.model;

import jakarta.validation.constraints.NotBlank;

public record AtaRequest(
        @NotBlank String transcript,
        @NotBlank String title
) {}
