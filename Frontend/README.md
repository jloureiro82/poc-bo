# Onboarding
## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## instruções e steps basicos para não fugir do padrão
1. instalar CLI do angular `npm install -g @angular/cli`
2. começar um projeto: `ng new <projectName>` 
    - vai criar um subfolder com o novo projeto
    - apagar o conteudo placeholder em app.component.html
3. criando um componente: `ng g component <componentName>`
    - usar kebab-case para nome de componentes
    - pode adicionar o nome da pasta para criar subdivisões, ex: shared/input-field, caso contrario o componente será criado na pasta src/app
    - atenção com a relação entre pastas e modulos, se o componente vai na pata shared então deve adicionar no modulo shared incluindo `-m shared` ao comando
    - pode utilizar `--dry-run` junto do comando para analisar o que será criado antes de executar efetivamente
    - utilizar `--export` em submodulos para que os componentes/diretivas sejam exportadas para outros modulos que o utilizem
    

## exemplo step by step
Exemplo da criação de um projeto, com um modulo shared, e dentro de shared um novo modulo de layout de formulario
1. criando o projeto `ng new exemplo`
2. criando o modulo shared `ng g module shared -m app`
    - usamos `-m app` para vincular o modulo ao app principal
3. criando o submodulo para o formulario `ng g module shared/form-layout -m shared`
    - o nome com prefixo `shared/` para que seja criado dentro do diretorio shared por organização
    - informamos `-m shared` para vincular o submodulo ao modulo shared
4. criando o componente de formulario `ng g component -m shared/form-layout shared/form-layout/components/form-layout --export`
    - usamos `-m shared/form-layout` para informar em qual modulo será vinculado o componente
    - o parametro `--export` serve para que seja exportado pelo modulo
    

## Project Specific Setup: Dynamic Grid Sample
1. First install `node` in your machine. 
2. Open a cmd terminal and go to the folder NodeServer(located at: dynamic-grid-sample module)
3. For the first time run: `npm install dynamic-grid-sample`
4. Then run `npm start`

## Observations
about ng generate:
1. components devem informar `-m` module e `--export` caso precisem ser publicos (em relação ao modulo), services não possuem modulo (tree shaking, só existem se forem referenciados em algum arquivo), modules não possuem `--export` mas precisam fazer bind com outros modulos `-m <parent>` 