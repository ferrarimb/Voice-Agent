# Deploy Voice Agent - Digital Ocean

## Servidor Atual

| Item | Valor |
|------|-------|
| **IP** | `167.99.233.112` |
| **URL** | `https://voice.abianca.com.br` |
| **Webhook Twilio** | `https://voice.abianca.com.br/incoming-call` |
| **Droplet** | `backend-bianca` |

---

## Conectar ao Servidor

```bash
ssh root@167.99.233.112
```

---

## Comandos Úteis

### Ver status do serviço
```bash
docker service ls | grep voice
```

### Ver logs em tempo real
```bash
docker service logs -f voice-agent_voice-agent
```

### Ver últimos 50 logs
```bash
docker service logs voice-agent_voice-agent --tail 50
```

### Reiniciar serviço
```bash
docker service update --force voice-agent_voice-agent
```

### Parar serviço
```bash
docker stack rm voice-agent
```

### Iniciar serviço
```bash
cd /opt/voice-agent
docker stack deploy -c docker-compose.yml voice-agent
```

---

## Atualizar Código (Deploy)

### 1. No seu PC Windows (após fazer alterações)
```powershell
git add .
git commit -m "sua mensagem"
git push
```

### 2. No servidor
```bash
cd /opt/voice-agent
git pull
docker build -t voice-agent:latest .
docker service update --force voice-agent_voice-agent
```

### Comando único para atualizar:
```bash
cd /opt/voice-agent && git pull && docker build -t voice-agent:latest . && docker service update --force voice-agent_voice-agent
```

---

## Estrutura no Servidor

```
/opt/voice-agent/
├── server.js           # Servidor principal
├── package.json        # Dependências
├── Dockerfile          # Build da imagem
├── docker-compose.yml  # Configuração do stack
└── ...                 # Outros arquivos do projeto
```

---

## Variáveis de Ambiente

### ⚠️ SEGURANÇA IMPORTANTE

**NUNCA commite credenciais no Git!** O arquivo `.env` está no `.gitignore` e não deve ser versionado.

### No Desenvolvimento Local

1. Copie o template:
```bash
cp .env.example .env
```

2. Edite `.env` com suas credenciais reais (nunca commite este arquivo!)

### No Servidor Digital Ocean

As variáveis estão configuradas no `docker-compose.yml`:

```yaml
environment:
  - GEMINI_API_KEY=your_key
  - OPENAI_API_KEY=sk-proj-...
  - TWILIO_ACCOUNT_SID=AC3883d04e400fe1328cf490a389fa910a
  - TWILIO_AUTH_TOKEN=88d5510ee584e8866782e83083dc5867
  - TWILIO_FROM_NUMBER=+5511993137410
  - N8N_WEBHOOK_URL=https://...
  - PORT=5000
```

Para alterar credenciais no servidor:
```bash
nano /opt/voice-agent/docker-compose.yml
```

Depois aplique:
```bash
docker stack deploy -c docker-compose.yml voice-agent
```

### 🔄 Atualizar Auth Token do Twilio

Se o Twilio rotacionar seu token (por exposição pública):

1. Obtenha novo token em: https://www.twilio.com/console
2. Atualize no servidor:
```bash
ssh root@167.99.233.112
nano /opt/voice-agent/docker-compose.yml
# Altere TWILIO_AUTH_TOKEN com o novo valor
docker stack deploy -c docker-compose.yml voice-agent
```
3. Atualize seu `.env` local (não commite!)
4. Configure na interface web em **Settings → Twilio Config**

**Comando completo para rebuild após atualizar token:**
```bash
ssh root@167.99.233.112
cd /opt/voice-agent
nano docker-compose.yml  # Edite o token
docker stack rm voice-agent && sleep 10 && docker build -t voice-agent:latest --no-cache . && docker stack deploy -c docker-compose.yml voice-agent
```

---

## Configuração do Twilio

### Para receber chamadas (Phone Interface)

No painel do Twilio, configure o webhook do número:

- **URL**: `https://voice.abianca.com.br/incoming-call`
- **Método**: `POST`

### Para Speed Dial (ponte SDR → Lead)

Na interface web (**Settings → Twilio Config**):

- **Webhook URL**: `https://voice.abianca.com.br`

O sistema usa automaticamente:
- `/incoming-call` - Para chamadas recebidas
- `/webhook/speed-dial` - Para discagem automática (ponte SDR-Lead)

#### Payload do `/webhook/speed-dial`

```json
{
  "nome_lead": "João Silva",
  "telefone_lead": "+5511999999999",
  "telefone_sdr": "+5511888888888",
  "data_agendamento": "2024-01-15 14:00",
  "n8n_url": "https://seu-webhook.com/endpoint",
  "TWILIO_ACCOUNT_SID": "ACxxxx",
  "TWILIO_AUTH_TOKEN": "xxxx",
  "TWILIO_FROM_NUMBER": "+5511993137410",
  "OPENAI_KEY": "sk-proj-xxx (OPCIONAL)",
  "token": "userToken123 (OPCIONAL)"
}
```

**Campo `OPENAI_KEY` (opcional):**
- Se fornecido, será usado para transcrição do áudio via Whisper API
- Permite usar uma chave diferente da configurada no servidor
- Se não fornecido, usa a chave padrão do servidor

**Campo `token` (opcional):**
- Token do usuário para identificação no webhook de retorno (fallback)
- Se não fornecido, o webhook de retorno enviará `"sem_token"`

#### Webhook de Retorno (Fallback)

O webhook de retorno é **sempre enviado** ao final da chamada, mesmo se a transcrição falhar.

**Payload do webhook de retorno (modo bridge):**

```json
{
  "assistantName": "Speed Dial Bridge",
  "transcript": "[SDR]: Olá, tudo bem?\n\n[LEAD]: Tudo ótimo!",
  "sdr_transcript": "Olá, tudo bem?",
  "lead_transcript": "Tudo ótimo!",
  "realtime_messages": [],
  "recordingUrl": "https://xxx.supabase.co/storage/v1/object/public/audios/call_xxx.wav",
  "timestamp": "2024-01-15T14:30:00.000Z",
  "status": "success",
  "mode": "bridge",
  "source": "bridge",
  "token": "userToken123 ou sem_token"
}
```

**Campos de transcrição:**
- **`transcript`** - Transcrição combinada com labels `[SDR]` e `[LEAD]`
- **`sdr_transcript`** - Somente o que o SDR falou
- **`lead_transcript`** - Somente o que o Lead falou

**Campo `token`:**
- Retorna o token enviado na requisição original ou `"sem_token"` se não foi fornecido

> ⚠️ Se a transcrição falhar, os campos de transcrição virão vazios mas o webhook ainda será enviado.

---

## Troubleshooting

### Serviço não inicia (0/1 replicas)
```bash
docker service logs voice-agent_voice-agent --tail 100
```

### Rebuild completo
```bash
cd /opt/voice-agent
docker stack rm voice-agent
docker build -t voice-agent:latest --no-cache .
docker stack deploy -c docker-compose.yml voice-agent
```

### Ver containers rodando
```bash
docker ps | grep voice
```

### Verificar se porta está em uso
```bash
ss -tlnp | grep 5000
```

---

## Arquitetura

```
Twilio Call → voice.abianca.com.br → Traefik (SSL) → Docker Container → server.js
                                                                           ↓
                                                                    WebSocket ↔ OpenAI/Gemini
                                                                           ↓
                                                                      n8n Webhook
```

---

## Monitoramento

O servidor usa **Docker Swarm** que automaticamente:
- Reinicia o container se ele crashar
- Mantém 1 réplica sempre rodando
- Gera logs centralizados

Para monitorar via Portainer (se configurado):
- URL: `https://portainer.abianca.com.br` (verificar se existe)

---

## Backup

Para fazer backup do código:
```bash
cd /opt
tar -czvf voice-agent-backup.tar.gz voice-agent/
```

---

## Custos

| Serviço | Custo |
|---------|-------|
| Digital Ocean Droplet | ~$12/mês (já existente) |
| Domínio | Já configurado |
| SSL | Gratuito (Let's Encrypt via Traefik) |
