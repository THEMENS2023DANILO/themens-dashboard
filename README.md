# The Mens — Dashboard

Dashboard interno plugado no Supabase. Login obrigatório (Supabase Auth, e-mail/senha).

## Rodar local

```
npm install
npm run dev
```

## Build / Deploy (Hostinger)

```
npm run build
```

Suba o conteúdo de `dist/` para a Hostinger (ou conecte o repositório GitHub no painel da Hostinger com build command `npm run build` e output `dist`).

**Importante (SPA):** crie um arquivo `.htaccess` no diretório publicado com:

```
RewriteEngine On
RewriteBase /
RewriteRule ^index\.html$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.html [L]
```

## Criar usuários de acesso

No painel do Supabase → Authentication → Users → **Add user** (e-mail + senha, marcar "Auto confirm").

## Estrutura

- **Overview** — KPIs do dia/período (cadastros, consultas, pedidos, spend Meta por BM)
- **Breakdown Pedidos 2026** — pedidos Nuvemshop desde 01/01/2026
- **Consultas Médicas** — fila médica com status, médico e tipo
- **Rastreios** — CPF × código de rastreio (Tiny)
- **Status Pedidos** — pedido × consulta × rastreio, com filtros

As views `v_dash_*` no Supabase alimentam as páginas (todas com `security_invoker = true` e leitura restrita a usuários autenticados).
