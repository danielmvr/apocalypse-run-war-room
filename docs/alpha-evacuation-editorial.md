# Última evacuação Alpha — comunicação pública

Base: `a71a0c371768bddc00ec9002d0d216b2a87eec16`. Alteração exclusivamente editorial do frontend, autorizada pelo operador para commit na `main` e publicação no GitHub Pages existente.

## Caminhos públicos

- Início: novos recrutas → `beta.html`, somente solicitação/análise/convite para os testes Play. Veteranos Alpha → `migracao.html`.
- Recrutamento: aviso para jogadores existentes antes do formulário, sem mudar formulário, scripts, consentimento, Turnstile ou backend.
- Guia de Campo: primeiro capítulo atualizado; jogabilidade e animações continuam usando a referência 0.20.0/build 128. Essa referência não é a versão Alpha de transição, 0.20.0-recovery-alpha/versionCode 1140.
- Migração: Google confirmado, Arca verificada e cópia fora do aparelho antes de planejar a troca. OAuth e faixa Play exigem autorização; assinaturas Alpha/Play são diferentes. Dados remotos e histórico local são distintos; importação depende de prévia, confirmação e comprovação, sem promessa de recuperação integral do legado.

Os perfis Esportista/Estrategista permanecem estilos de aprendizado, sem definir se a pessoa é nova ou veterana. O botão flutuante de recrutamento foi preservado.

## Validação local

- `npm test`: 19 testes existentes aprovados.
- `npm run test:browser`: 10 testes aprovados, incluindo cinco regressões existentes e cinco verificações editoriais. As inscrições usam serviços e identidade sintéticos com interceptação local, sem cadastro real.
- `npm run build`: aprovado, incluindo a nova entrada estática `migracao.html`.
- Links internos do build resolvidos; formulário/scripts/privacidade da página de inscrição e capítulos de jogabilidade/animações comparados literalmente com a base e preservados.
- Larguras 320, 360, 412 e 1440 px; movimento reduzido e texto ampliado a 200% na nova página, sem vazamento horizontal. Inspeção visual adicional em 360×900 e 1440×1000. Não equivale a validação completa de TalkBack em aparelho físico.
- Falhas iniciais corrigidas: quebra de palavras longas no texto ampliado e asserção que confundia o cliente Vite de desenvolvimento com script da página.
- Revisão pontual de design incorporada: rotas independentes dos perfis e progressão descrita somente após importação confirmada.

Há aviso de tamanho do chunk principal no build; não foi iniciada otimização ou refatoração do mapa. API, ranking, placares, temporizador, Edge Functions, APKs, Play e dados de jogadores não foram alterados.

A conclusão da publicação depende do workflow GitHub Pages e da conferência das URLs efetivamente publicadas, registrados no Covil do projeto Android após o deploy. Esta comunicação não autoriza migração automática nem lançamento de produção.
