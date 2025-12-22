require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const ExcelJS = require('exceljs');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurações
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Configurar upload de arquivos
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Cliente Anthropic
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Prompt completo do sistema
const SYSTEM_PROMPT = `${fs.readFileSync(path.join(__dirname, 'prompt.txt'), 'utf-8')}`;

// Endpoint principal - processar receita
app.post('/api/processar-receita', upload.single('imagem'), async (req, res) => {
  try {
    const { texto, link } = req.body;
    const imagem = req.file;

    let conteudoReceita = '';

    // Determinar fonte da receita
    if (link) {
      conteudoReceita = await buscarReceitaDoLink(link);
    } else if (imagem) {
      conteudoReceita = await extrairTextoImagem(imagem.path);
    } else if (texto) {
      conteudoReceita = texto;
    } else {
      return res.status(400).json({ erro: 'Nenhuma receita fornecida' });
    }

    // Processar com Claude
    const resultado = await processarComClaude(conteudoReceita);

    // Gerar Excel
    const arquivoExcel = await gerarFichaTecnica(resultado);

    // Retornar arquivo
    res.json({
      sucesso: true,
      nomeReceita: resultado.nomeReceita,
      avisos: resultado.avisos,
      arquivo: arquivoExcel
    });

    // Limpar arquivo temporário se houver
    if (imagem) {
      await fs.unlink(imagem.path).catch(() => {});
    }

  } catch (erro) {
    console.error('Erro ao processar receita:', erro);
    res.status(500).json({ 
      erro: 'Erro ao processar receita', 
      detalhes: erro.message 
    });
  }
});

// Buscar receita de link
async function buscarReceitaDoLink(link) {
  try {
    const response = await axios.get(link, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });
    return response.data;
  } catch (erro) {
    throw new Error(`Não consegui acessar o link ${link}. Por favor, copie e cole o conteúdo da receita.`);
  }
}

// Extrair texto de imagem via Claude
async function extrairTextoImagem(caminhoImagem) {
  const imagemBuffer = await fs.readFile(caminhoImagem);
  const imagemBase64 = imagemBuffer.toString('base64');

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/jpeg',
            data: imagemBase64
          }
        },
        {
          type: 'text',
          text: 'Extraia todo o texto desta imagem de receita, incluindo nome, ingredientes e modo de preparo.'
        }
      ]
    }]
  });

  return message.content[0].text;
}

// Processar receita com Claude
async function processarComClaude(conteudoReceita) {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `Processe esta receita e retorne em formato JSON estruturado:

${conteudoReceita}

Retorne APENAS um objeto JSON válido com esta estrutura:
{
  "nomeReceita": "nome da receita",
  "ingredientes": [
    {"nome": "ingrediente", "qtdBruta": 100, "qtdLiquida": 100, "preco": null}
  ],
  "modoPreparo": "texto completo do modo de preparo",
  "avisos": ["aviso1", "aviso2"]
}`
    }]
  });

  const textoResposta = message.content[0].text;
  
  // Extrair JSON da resposta (pode vir com markdown)
  const jsonMatch = textoResposta.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Claude não retornou JSON válido');
  }

  return JSON.parse(jsonMatch[0]);
}

// Gerar ficha técnica em Excel
async function gerarFichaTecnica(dados) {
  const workbook = new ExcelJS.Workbook();
  
  // Carregar template
  await workbook.xlsx.readFile(path.join(__dirname, 'template', 'Modelo_FT_2026.xlsx'));
  
  const worksheet = workbook.getWorksheet('Planilha1');
  
  // Preencher dados
  const hoje = new Date().toLocaleDateString('pt-BR');
  worksheet.getCell('B2').value = `Data de revisão: ${hoje}`;
  worksheet.getCell('B3').value = `Preparo: ${dados.nomeReceita}`;
  
  // Ingredientes (linhas 5-16)
  dados.ingredientes.forEach((ing, idx) => {
    if (idx >= 12) return; // Máximo 12 ingredientes
    
    const linha = 5 + idx;
    worksheet.getCell(`B${linha}`).value = ing.nome;
    worksheet.getCell(`C${linha}`).value = ing.qtdBruta;
    worksheet.getCell(`D${linha}`).value = ing.qtdLiquida;
    if (ing.preco !== null) {
      worksheet.getCell(`G${linha}`).value = ing.preco;
    }
  });
  
  // Modo de preparo
  worksheet.getCell('E19').value = `FORMA DE PREPARO:\n\n${dados.modoPreparo}`;
  
  // Salvar
  const nomeArquivo = `FT_${dados.nomeReceita.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
  const caminhoArquivo = path.join(__dirname, 'output', nomeArquivo);
  
  await fs.mkdir(path.join(__dirname, 'output'), { recursive: true });
  await workbook.xlsx.writeFile(caminhoArquivo);
  
  // Converter para base64 para retornar ao frontend
  const buffer = await fs.readFile(caminhoArquivo);
  const base64 = buffer.toString('base64');
  
  return {
    nome: nomeArquivo,
    dados: base64
  };
}

// Endpoint de saúde
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📝 Acesse: http://localhost:${PORT}`);
});
