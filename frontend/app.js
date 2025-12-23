// Configuração da API
const API_URL = 'http://localhost:3000/api';

// Elementos DOM
const tabs = document.querySelectorAll('.tab');
const tabPanes = document.querySelectorAll('.tab-pane');
const processarBtn = document.getElementById('processarBtn');
const loading = document.getElementById('loading');
const resultado = document.getElementById('resultado');
const erro = document.getElementById('erro');
const uploadArea = document.getElementById('uploadArea');
const receitaFoto = document.getElementById('receitaFoto');
const previewArea = document.getElementById('previewArea');
const previewImage = document.getElementById('previewImage');
const removeImage = document.getElementById('removeImage');

let arquivoAtual = null;

// Sistema de Tabs
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const targetTab = tab.dataset.tab;
        
        // Atualizar tabs ativas
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        // Atualizar conteúdo ativo
        tabPanes.forEach(pane => {
            pane.classList.remove('active');
            if (pane.id === targetTab) {
                pane.classList.add('active');
            }
        });
    });
});

// Upload de Imagem
uploadArea.addEventListener('click', () => {
    receitaFoto.click();
});

uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = 'var(--primary)';
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.style.borderColor = 'var(--border)';
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = 'var(--border)';
    
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
        mostrarPreview(file);
    }
});

receitaFoto.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        mostrarPreview(file);
    }
});

removeImage.addEventListener('click', (e) => {
    e.stopPropagation();
    limparPreview();
});

function mostrarPreview(file) {
    arquivoAtual = file;
    const reader = new FileReader();
    
    reader.onload = (e) => {
        previewImage.src = e.target.result;
        document.querySelector('.upload-placeholder').style.display = 'none';
        previewArea.style.display = 'block';
    };
    
    reader.readAsDataURL(file);
}

function limparPreview() {
    arquivoAtual = null;
    receitaFoto.value = '';
    document.querySelector('.upload-placeholder').style.display = 'block';
    previewArea.style.display = 'none';
    previewImage.src = '';
}

// Processar Receita
processarBtn.addEventListener('click', async () => {
    const tabAtiva = document.querySelector('.tab.active').dataset.tab;
    
    try {
        // Validar entrada
        let dadosEnvio;
        
        if (tabAtiva === 'texto') {
            const texto = document.getElementById('receitaTexto').value.trim();
            if (!texto) {
                alert('Por favor, cole o texto da receita.');
                return;
            }
            dadosEnvio = { texto };
            
        } else if (tabAtiva === 'link') {
            const link = document.getElementById('receitaLink').value.trim();
            if (!link) {
                alert('Por favor, insira o link da receita.');
                return;
            }
            dadosEnvio = { link };
            
        } else if (tabAtiva === 'foto') {
            if (!arquivoAtual) {
                alert('Por favor, selecione uma foto da receita.');
                return;
            }
            // Para foto, usamos FormData
            dadosEnvio = new FormData();
            dadosEnvio.append('imagem', arquivoAtual);
        }
        
        // Mostrar loading
        esconderTudo();
        loading.style.display = 'block';
        processarBtn.disabled = true;
        
        // Enviar para API
        const response = await fetch(`${API_URL}/processar-receita`, {
            method: 'POST',
            ...(tabAtiva === 'foto' 
                ? { body: dadosEnvio }
                : {
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(dadosEnvio)
                }
            )
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.erro || 'Erro ao processar receita');
        }
        
        // Mostrar resultado
        mostrarResultado(data);
        
    } catch (error) {
        console.error('Erro:', error);
        mostrarErro(error.message);
    } finally {
        loading.style.display = 'none';
        processarBtn.disabled = false;
    }
});

function mostrarResultado(data) {
    esconderTudo();
    
    document.getElementById('resultadoNome').textContent = data.nomeReceita;
    
    // Mostrar avisos se houver
    if (data.avisos && data.avisos.length > 0) {
        const avisos = document.getElementById('avisos');
        const listaAvisos = document.getElementById('listaAvisos');
        
        listaAvisos.innerHTML = '';
        data.avisos.forEach(aviso => {
            const li = document.createElement('li');
            li.textContent = aviso;
            listaAvisos.appendChild(li);
        });
        
        avisos.style.display = 'block';
    }
    
    // Configurar botão de download
    const downloadBtn = document.getElementById('downloadBtn');
    downloadBtn.onclick = () => {
        const link = document.createElement('a');
        link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${data.arquivo.dados}`;
        link.download = data.arquivo.nome;
        link.click();
    };
    
    resultado.style.display = 'block';
}

function mostrarErro(mensagem) {
    esconderTudo();
    document.getElementById('erroMsg').textContent = mensagem;
    erro.style.display = 'block';
}

function esconderTudo() {
    loading.style.display = 'none';
    resultado.style.display = 'none';
    erro.style.display = 'none';
}

// Botões de ação
document.getElementById('novaFichaBtn').addEventListener('click', () => {
    esconderTudo();
    limparFormulario();
});

document.getElementById('tentarNovamenteBtn').addEventListener('click', () => {
    esconderTudo();
});

function limparFormulario() {
    document.getElementById('receitaTexto').value = '';
    document.getElementById('receitaLink').value = '';
    limparPreview();
}
