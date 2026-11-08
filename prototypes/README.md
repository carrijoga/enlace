# Protótipos de referência

O HTML recebido é mantido integralmente em `private/Planejador-da-Cerimonia-v3.html` apenas neste ambiente local. A pasta `private/` é ignorada pelo Git porque o arquivo inclui nomes, relações e regras pessoais do exemplo original. Não há mudanças no arquivo da pasta Downloads.

A referência não é a nova aplicação e não deve ser publicada como demo. O diagnóstico usa as linhas desse HTML original; a cópia preserva os mesmos bytes. O caminho de origem e o SHA-256 verificado constam em `MEMORY.md`.

Em outro clone, obtenha a fonte autorizada ou uma fixture sanitizada antes de fazer comparações. Não há sincronização automática desta cópia. Salve os dados de uso como JSON no navegador original antes de trocar de arquivo/origem, pois `localStorage` não é portável entre dispositivos ou origens.

Na migração, crie exemplos fictícios versionáveis e cubra os contratos com testes; não use a referência privada como dependência de testes/CI.
