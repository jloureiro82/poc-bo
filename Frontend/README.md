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
    