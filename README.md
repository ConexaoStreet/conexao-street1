# Conexão Street (GitHub Pages + Supabase)

Este repositório é um site estático (GitHub Pages) com:
- Catálogo (products.json ou Supabase `cs_products`)
- Checkout que cria pedidos (Supabase `cs_orders`)
- Pagamento (PIX) com botão "Já paguei" (marca o pedido como pago)
- Área do membro (Supabase Auth + trava 1 dispositivo)
- Admin e Admin+ (aprovação e painel)
- Vault (vip.html/final.html) com links protegidos por aprovação

## Rodar localmente (sem instalar nada)
1. Abra a pasta e clique em `index.html`.
2. Para evitar cache agressivo, use um servidor local:
   - Android: "Simple HTTP Server" (ou similar)
   - PC: `python -m http.server 5173` e abra `http://localhost:5173`

## Configurar Supabase
1. Crie um projeto no Supabase.
2. No painel do Supabase:
   - SQL Editor: cole e execute `supabase/SETUP.sql`
   - Authentication: habilite Email/Password
3. Edite `config.js` e coloque:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`

## Definir o primeiro admin
Como RLS fica ativo, você precisa criar o primeiro admin manualmente:
1. Crie uma conta pelo site (`member.html`) com seu email.
2. No Supabase SQL Editor, rode:

```sql
insert into public.cs_admins(user_id)
select id from auth.users where lower(email) = lower('SEU_EMAIL_AQUI');
```

Depois disso, você pode usar o painel Admin para promover outros admins.

## Deploy no GitHub Pages
1. Faça upload desta pasta para um repositório.
2. GitHub → Settings → Pages → Deploy from branch → `/ (root)`.
3. Acesse a URL do seu Pages.

## Observações importantes
- Por ser GitHub Pages, arquivos em `/data/*.json` são públicos. A "proteção" real precisa estar no Supabase (Vault) ou em Storage privado.
- O botão "Já paguei" apenas marca o pedido como pago; a aprovação continua sendo do admin.

