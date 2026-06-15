import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Minus, RefreshCw, ExternalLink, AlertCircle, Key, Plus, X, Eye, EyeOff } from 'lucide-react';

const ATIVOS_PADRAO = [
  { ticker: 'PETR4', nome: 'Petrobras PN' },
  { ticker: 'VALE3', nome: 'Vale ON' },
  { ticker: 'ITUB4', nome: 'Itaú Unibanco PN' },
  { ticker: 'MGLU3', nome: 'Magazine Luiza ON' },
];

const ATIVOS_LIVRES = ['PETR4', 'VALE3', 'ITUB4', 'MGLU3'];

function calcularRSI(precos, periodo = 14) {
  if (precos.length < periodo + 1) return null;
  let ganhos = 0, perdas = 0;
  for (let i = 1; i <= periodo; i++) {
    const diff = precos[i] - precos[i - 1];
    if (diff >= 0) ganhos += diff;
    else perdas -= diff;
  }
  let avgGain = ganhos / periodo;
  let avgLoss = perdas / periodo;

  for (let i = periodo + 1; i < precos.length; i++) {
    const diff = precos[i] - precos[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (periodo - 1) + gain) / periodo;
    avgLoss = (avgLoss * (periodo - 1) + loss) / periodo;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calcularMedia(precos, periodo) {
  if (precos.length < periodo) return null;
  const slice = precos.slice(-periodo);
  return slice.reduce((a, b) => a + b, 0) / periodo;
}

function calcularEMASerie(precos, periodo) {
  if (precos.length < periodo) return [];
  const k = 2 / (periodo + 1);
  const emas = [];
  let emaAnterior = precos.slice(0, periodo).reduce((a, b) => a + b, 0) / periodo;
  emas[periodo - 1] = emaAnterior;
  for (let i = periodo; i < precos.length; i++) {
    emaAnterior = precos[i] * k + emaAnterior * (1 - k);
    emas[i] = emaAnterior;
  }
  return emas;
}

function calcularMACD(precos, periodoRapido = 12, periodoLento = 26, periodoSinal = 9) {
  if (precos.length < periodoLento + periodoSinal) return null;

  const emaRapida = calcularEMASerie(precos, periodoRapido);
  const emaLenta = calcularEMASerie(precos, periodoLento);

  const macdSerie = [];
  for (let i = 0; i < precos.length; i++) {
    if (emaRapida[i] != null && emaLenta[i] != null) {
      macdSerie[i] = emaRapida[i] - emaLenta[i];
    }
  }

  const macdValores = macdSerie.filter(v => v != null);
  if (macdValores.length < periodoSinal) return null;

  const signalSerie = calcularEMASerie(macdValores, periodoSinal);
  const macdLine = macdValores[macdValores.length - 1];
  const signalLine = signalSerie[signalSerie.length - 1];
  const macdLineAnterior = macdValores[macdValores.length - 2];
  const signalLineAnterior = signalSerie[signalSerie.length - 2];

  if (signalLine == null) return null;

  return {
    macdLine,
    signalLine,
    histograma: macdLine - signalLine,
    cruzouParaCima: macdLineAnterior != null && signalLineAnterior != null &&
      macdLineAnterior <= signalLineAnterior && macdLine > signalLine,
    cruzouParaBaixo: macdLineAnterior != null && signalLineAnterior != null &&
      macdLineAnterior >= signalLineAnterior && macdLine < signalLine,
  };
}

function calcularBollinger(precos, periodo = 20, desvios = 2) {
  if (precos.length < periodo) return null;
  const slice = precos.slice(-periodo);
  const media = slice.reduce((a, b) => a + b, 0) / periodo;
  const variancia = slice.reduce((acc, v) => acc + Math.pow(v - media, 2), 0) / periodo;
  const desvioPadrao = Math.sqrt(variancia);

  const bandaSuperior = media + desvios * desvioPadrao;
  const bandaInferior = media - desvios * desvioPadrao;
  const precoAtual = precos[precos.length - 1];

  const largura = bandaSuperior - bandaInferior;
  const posicao = largura > 0 ? (precoAtual - bandaInferior) / largura : 0.5;

  return { bandaSuperior, bandaInferior, media, posicao };
}

function calcularTendencia(precos) {
  const mediaCurta = calcularMedia(precos, 9);
  const mediaLonga = calcularMedia(precos, 21);
  const macd = calcularMACD(precos);

  if (mediaCurta == null || mediaLonga == null) {
    return { direcao: 'lateral', texto: 'Indefinida', cor: 'gray' };
  }

  const diffPercent = ((mediaCurta - mediaLonga) / mediaLonga) * 100;
  const macdPositivo = macd ? macd.histograma > 0 : null;
  const macdNegativo = macd ? macd.histograma < 0 : null;

  const limiarLateral = 0.15;

  if (diffPercent > limiarLateral) {
    const forte = macdPositivo === true;
    return {
      direcao: 'alta',
      texto: forte ? 'ALTA (confirmada)' : 'ALTA',
      cor: 'green',
    };
  }
  if (diffPercent < -limiarLateral) {
    const forte = macdNegativo === true;
    return {
      direcao: 'baixa',
      texto: forte ? 'BAIXA (confirmada)' : 'BAIXA',
      cor: 'red',
    };
  }
  return { direcao: 'lateral', texto: 'LATERAL', cor: 'gray' };
}

function gerarSinal(precos, rsi) {
  if (!rsi || precos.length < 30) return { tipo: 'aguardando', texto: 'Dados insuficientes', cor: 'gray', detalhes: null };

  const mediaCurta = calcularMedia(precos, 9);
  const mediaLonga = calcularMedia(precos, 21);
  const macd = calcularMACD(precos);
  const bollinger = calcularBollinger(precos);

  const detalhes = {
    rsi: rsi?.toFixed(1),
    macdHistograma: macd?.histograma?.toFixed(4),
    bollingerPosicao: bollinger?.posicao != null ? (bollinger.posicao * 100).toFixed(0) + '%' : null,
  };

  if (!macd || !bollinger) {
    if (rsi < 33 && mediaCurta > mediaLonga) {
      return { tipo: 'compra', texto: 'Possível ponto de COMPRA', cor: 'green', detalhes };
    }
    if (rsi > 68 && mediaCurta < mediaLonga) {
      return { tipo: 'venda', texto: 'Possível ponto de VENDA', cor: 'red', detalhes };
    }
    return { tipo: 'neutro', texto: 'Sem sinal claro - aguardar', cor: 'gray', detalhes };
  }

  const rsiCompra = rsi < 33;
  const macdCompra = macd.histograma > 0 || macd.cruzouParaCima;
  const bollingerCompra = bollinger.posicao < 0.25;

  const rsiVenda = rsi > 68;
  const macdVenda = macd.histograma < 0 || macd.cruzouParaBaixo;
  const bollingerVenda = bollinger.posicao > 0.75;

  const votosCompra = [rsiCompra, macdCompra, bollingerCompra].filter(Boolean).length;
  const votosVenda = [rsiVenda, macdVenda, bollingerVenda].filter(Boolean).length;

  if (rsiCompra && votosCompra >= 2) {
    return { tipo: 'compra', texto: 'COMPRA (confluência de indicadores)', cor: 'green', detalhes };
  }
  if (rsiVenda && votosVenda >= 2) {
    return { tipo: 'venda', texto: 'VENDA (confluência de indicadores)', cor: 'red', detalhes };
  }
  if (rsiCompra || bollingerCompra) {
    return { tipo: 'observar_compra', texto: 'Sobrevendido - observar', cor: 'yellow', detalhes };
  }
  if (rsiVenda || bollingerVenda) {
    return { tipo: 'observar_venda', texto: 'Sobrecomprado - observar', cor: 'yellow', detalhes };
  }
  return { tipo: 'neutro', texto: 'Sem sinal claro - aguardar', cor: 'gray', detalhes };
}

function CardAtivo({ ticker, nome, dados, loading, erro, onRemover, podeRemover }) {
  const sinalCores = {
    green: 'bg-green-500/15 text-green-400 border-green-500/30',
    red: 'bg-red-500/15 text-red-400 border-red-500/30',
    yellow: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    gray: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  };

  if (loading) {
    return (
      <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 animate-pulse">
        <div className="h-6 bg-slate-700 rounded w-1/3 mb-4"></div>
        <div className="h-32 bg-slate-700 rounded"></div>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="bg-slate-800 rounded-xl p-5 border border-red-900/50 relative">
        {podeRemover && (
          <button onClick={onRemover} className="absolute top-3 right-3 text-slate-500 hover:text-red-400">
            <X size={16} />
          </button>
        )}
        <div className="flex items-center gap-2 text-red-400">
          <AlertCircle size={18} />
          <span className="font-semibold">{ticker}</span>
        </div>
        <p className="text-sm text-slate-400 mt-2">{erro}</p>
      </div>
    );
  }

  if (!dados) return null;

  const { precoAtual, variacao, variacaoPercent, historico, rsi, sinal, tendencia } = dados;
  const SinalIcon = sinal.tipo === 'compra' ? TrendingUp : sinal.tipo === 'venda' ? TrendingDown : Minus;
  const TendenciaIcon = tendencia?.direcao === 'alta' ? TrendingUp : tendencia?.direcao === 'baixa' ? TrendingDown : Minus;
  const tendenciaCores = {
    green: 'bg-green-500/15 text-green-400 border-green-500/30',
    red: 'bg-red-500/15 text-red-400 border-red-500/30',
    gray: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  };

  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 hover:border-slate-600 transition-colors relative">
      {podeRemover && (
        <button onClick={onRemover} className="absolute top-3 right-3 text-slate-500 hover:text-red-400 z-10">
          <X size={16} />
        </button>
      )}
      <div className="flex justify-between items-start mb-1 pr-5">
        <div>
          <h3 className="text-lg font-bold text-white">{ticker}</h3>
          <p className="text-xs text-slate-400">{nome}</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold text-white">
            R$ {precoAtual?.toFixed(2)}
          </p>
          <p className={`text-sm font-medium ${variacao >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {variacao >= 0 ? '+' : ''}{variacaoPercent?.toFixed(2)}%
          </p>
          {tendencia && (
            <div className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-medium border ${tendenciaCores[tendencia.cor]}`}>
              <TendenciaIcon size={12} />
              {tendencia.texto}
            </div>
          )}
        </div>
      </div>

      {historico && historico.length > 1 && (
        <div className="h-24 mt-3 -mx-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={historico}>
              <Line
                type="monotone"
                dataKey="preco"
                stroke={variacao >= 0 ? '#4ade80' : '#f87171'}
                strokeWidth={2}
                dot={false}
              />
              <XAxis dataKey="data" hide />
              <YAxis domain={['auto', 'auto']} hide />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
                labelStyle={{ color: '#94a3b8' }}
                formatter={(value) => [`R$ ${value.toFixed(2)}`, 'Preço']}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-700">
        <div className="text-xs text-slate-400">
          RSI: <span className="font-semibold text-slate-200">{rsi?.toFixed(1) ?? '-'}</span>
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${sinalCores[sinal.cor]}`}>
          <SinalIcon size={14} />
          {sinal.texto}
        </div>
      </div>
      {sinal.detalhes && (sinal.detalhes.macdHistograma != null || sinal.detalhes.bollingerPosicao != null) && (
        <div className="flex gap-3 mt-2 text-xs text-slate-500">
          {sinal.detalhes.macdHistograma != null && (
            <span>MACD hist: {sinal.detalhes.macdHistograma}</span>
          )}
          {sinal.detalhes.bollingerPosicao != null && (
            <span>Posição Bollinger: {sinal.detalhes.bollingerPosicao}</span>
          )}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [mostrarToken, setMostrarToken] = useState(false);
  const [novoTicker, setNovoTicker] = useState('');
  const [ativosExtras, setAtivosExtras] = useState([]);

  const [dadosAtivos, setDadosAtivos] = useState({});
  const [dadosDolar, setDadosDolar] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState(null);
  const [abaSelecionada, setAbaSelecionada] = useState('acoes');

  const todosAtivos = [...ATIVOS_PADRAO, ...ativosExtras];

  async function buscarAtivo(ticker) {
    if (!token && !ATIVOS_LIVRES.includes(ticker)) {
      return { erro: 'Requer token (adicione seu token gratuito da brapi acima)' };
    }

    const tokenParam = token && !ATIVOS_LIVRES.includes(ticker) ? `&token=${token}` : '';

    try {
      const resp = await fetch(
        `https://brapi.dev/api/quote/${ticker}?range=6mo&interval=1d${tokenParam}`
      );
      if (!resp.ok) {
        let msg = `Erro ${resp.status}`;
        try {
          const errJson = await resp.json();
          if (errJson?.message) msg = errJson.message;
        } catch (e) {}
        if (resp.status === 401 || resp.status === 403) {
          return { erro: `Token inválido ou sem permissão (${msg})` };
        }
        if (resp.status === 429) {
          return { erro: 'Limite de requisições do plano gratuito atingido. Aguarde um minuto e clique em Atualizar.' };
        }
        return { erro: msg };
      }
      const json = await resp.json();
      const r = json.results?.[0];

      if (!r || r.regularMarketPrice == null) {
        return { erro: 'Ticker não encontrado ou sem dados' };
      }

      const historicoRaw = r.historicalDataPrice || [];
      const precos = historicoRaw.map(h => h.close).filter(p => p != null);
      const historico = historicoRaw.slice(-30).map(h => ({
        data: new Date(h.date * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        preco: h.close,
      }));

      const rsi = calcularRSI(precos);
      const sinal = gerarSinal(precos, rsi);
      const tendencia = calcularTendencia(precos);

      return {
        precoAtual: r.regularMarketPrice,
        variacao: r.regularMarketChange,
        variacaoPercent: r.regularMarketChangePercent,
        historico,
        rsi,
        sinal,
        tendencia,
        nomeCompleto: r.shortName || r.longName,
      };
    } catch (e) {
      return { erro: `Não foi possível carregar: ${e.message}` };
    }
  }

  async function buscarDolar() {
    try {
      const resp = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL');
      if (!resp.ok) {
        setDadosDolar({ erro: `Erro ${resp.status} ao buscar cotação` });
        return;
      }
      const json = await resp.json();
      const c = json.USDBRL;
      if (!c) {
        setDadosDolar({ erro: 'Resposta sem dados de cotação' });
        return;
      }

      const resultado = {
        valor: parseFloat(c.bid),
        variacaoPercent: parseFloat(c.pctChange),
        atualizadoEm: c.create_date,
        historico: null,
        rsi: null,
        sinal: null,
        tendencia: null,
      };

      try {
        const respHist = await fetch('https://economia.awesomeapi.com.br/json/daily/USD-BRL/60');
        if (respHist.ok) {
          const histData = await respHist.json();
          if (Array.isArray(histData) && histData.length > 35) {
            const ordenado = [...histData].reverse();
            const precos = ordenado.map(h => parseFloat(h.bid)).filter(p => !isNaN(p));
            const historico = ordenado.slice(-30).map(h => ({
              data: new Date(parseInt(h.timestamp) * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
              preco: parseFloat(h.bid),
            }));
            resultado.historico = historico;
            resultado.rsi = calcularRSI(precos);
            resultado.sinal = gerarSinal(precos, resultado.rsi);
            resultado.tendencia = calcularTendencia(precos);
          }
        }
      } catch (e) {}

      setDadosDolar(resultado);
    } catch (e) {
      setDadosDolar({ erro: `Falha de rede: ${e.message}` });
    }
  }

  async function carregarDados() {
    setLoading(true);
    for (const ativo of todosAtivos) {
      const resultado = await buscarAtivo(ativo.ticker);
      setDadosAtivos(prev => ({ ...prev, [ativo.ticker]: resultado }));
      await new Promise(res => setTimeout(res, 400));
    }
    await buscarDolar();
    setUltimaAtualizacao(new Date());
    setLoading(false);
  }

  useEffect(() => {
    carregarDados();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function salvarToken() {
    setToken(tokenInput.trim());
  }

  function removerToken() {
    setToken('');
    setTokenInput('');
    setAtivosExtras([]);
  }

  async function adicionarTicker() {
    const ticker = novoTicker.trim().toUpperCase();
    if (!ticker) return;
    if (todosAtivos.some(a => a.ticker === ticker)) {
      setNovoTicker('');
      return;
    }

    setNovoTicker('');
    setAtivosExtras(prev => [...prev, { ticker, nome: 'Carregando...' }]);
    setLoading(true);

    const resultado = await buscarAtivo(ticker);
    setDadosAtivos(prev => ({ ...prev, [ticker]: resultado }));
    setAtivosExtras(prev =>
      prev.map(a => a.ticker === ticker ? { ...a, nome: resultado.nomeCompleto || ticker } : a)
    );
    setLoading(false);
  }

  function removerTicker(ticker) {
    setAtivosExtras(prev => prev.filter(a => a.ticker !== ticker));
    setDadosAtivos(prev => {
      const novo = { ...prev };
      delete novo[ticker];
      return novo;
    });
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 md:p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-bold">Painel de Análise Financeira</h1>
            <p className="text-sm text-slate-400 mt-1">
              Sinais baseados em RSI, MACD e Bandas de Bollinger · Apenas para fins informativos
            </p>
          </div>
          <button
            onClick={carregarDados}
            disabled={loading}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors self-start md:self-auto"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </div>

        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Key size={16} className="text-blue-400" />
            <h3 className="text-sm font-semibold">Token brapi.dev (opcional, gratuito)</h3>
            {token && (
              <span className="text-xs bg-green-500/15 text-green-400 px-2 py-0.5 rounded-full border border-green-500/30">
                Ativo
              </span>
            )}
          </div>
          {!token ? (
            <div>
              <p className="text-xs text-slate-400 mb-2">
                Cole seu token gratuito (criado em <span className="text-blue-400">brapi.dev/dashboard</span>) para liberar qualquer ação da B3. Sem token, funcionam apenas PETR4, VALE3, ITUB4 e MGLU3.
              </p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={mostrarToken ? 'text' : 'password'}
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="Cole seu token aqui"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm pr-9 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={() => setMostrarToken(!mostrarToken)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    {mostrarToken ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <button
                  onClick={salvarToken}
                  disabled={!tokenInput.trim()}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 rounded-lg text-sm font-medium"
                >
                  Salvar
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                O token fica salvo apenas no seu navegador, não é enviado para nenhum servidor além da brapi.dev.
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">
                Token configurado · agora você pode adicionar qualquer ticker da B3 na aba Ações.
              </p>
              <button onClick={removerToken} className="text-xs text-red-400 hover:text-red-300 font-medium">
                Remover token
              </button>
            </div>
          )}
        </div>

        {ultimaAtualizacao && (
          <p className="text-xs text-slate-500 mb-4">
            Última atualização: {ultimaAtualizacao.toLocaleTimeString('pt-BR')}
          </p>
        )}

        <div className="flex gap-2 mb-5 border-b border-slate-700">
          {[
            { id: 'acoes', label: 'Ações' },
            { id: 'dolar', label: 'Dólar' },
            { id: 'fundos', label: 'Fundos de Investimento' },
          ].map(aba => (
            <button
              key={aba.id}
              onClick={() => setAbaSelecionada(aba.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                abaSelecionada === aba.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {aba.label}
            </button>
          ))}
        </div>

        {abaSelecionada === 'acoes' && (
          <div>
            <div className="mb-4 flex gap-2">
              <input
                type="text"
                value={novoTicker}
                onChange={(e) => setNovoTicker(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && adicionarTicker()}
                placeholder={token ? 'Adicionar ticker (ex: WEGE3)' : 'Adicione um token para liberar mais ativos'}
                disabled={!token}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 disabled:opacity-40"
              />
              <button
                onClick={adicionarTicker}
                disabled={!token || !novoTicker.trim()}
                className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 rounded-lg text-sm font-medium"
              >
                <Plus size={16} />
                Adicionar
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {todosAtivos.map(ativo => (
                <CardAtivo
                  key={ativo.ticker}
                  ticker={ativo.ticker}
                  nome={ativo.nome}
                  dados={dadosAtivos[ativo.ticker]}
                  loading={loading && !dadosAtivos[ativo.ticker]}
                  erro={dadosAtivos[ativo.ticker]?.erro}
                  podeRemover={ativosExtras.some(a => a.ticker === ativo.ticker)}
                  onRemover={() => removerTicker(ativo.ticker)}
                />
              ))}
            </div>

            <div className="mt-5 bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-sm text-slate-400">
              <p className="font-medium text-slate-300 mb-1">Como interpretar os sinais</p>
              <ul className="space-y-1 list-disc list-inside">
                <li><strong>Tendência (ALTA/BAIXA/LATERAL)</strong>: direção atual do movimento, baseada nas médias móveis e MACD. "Confirmada" = MACD reforça a direção.</li>
                <li>RSI abaixo de 33 = sobrevendido · acima de 68 = sobrecomprado</li>
                <li>MACD: histograma positivo favorece compra, negativo favorece venda</li>
                <li>Bandas de Bollinger: posição perto de 0% = próximo da banda inferior, perto de 100% = próximo da banda superior</li>
                <li><strong>Sinal de COMPRA/VENDA</strong> é diferente de tendência: indica possível ponto de reversão (RSI no extremo + confirmação de outro indicador)</li>
                <li>"Observar" = sinal parcial, sem confluência suficiente ainda</li>
              </ul>
            </div>
          </div>
        )}

        {abaSelecionada === 'dolar' && (
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <h3 className="text-lg font-bold mb-4">Dólar Americano / Real (USD/BRL)</h3>
            {loading && !dadosDolar && (
              <div className="h-20 bg-slate-700 rounded animate-pulse"></div>
            )}
            {dadosDolar?.erro ? (
              <div className="bg-red-900/20 border border-red-900/50 rounded-lg p-3 text-sm text-red-400">
                Erro: {dadosDolar.erro}
              </div>
            ) : dadosDolar ? (
              <div>
                <div className="flex items-end gap-3">
                  <p className="text-3xl font-bold">R$ {dadosDolar.valor.toFixed(4)}</p>
                  <p className={`text-sm font-medium pb-1 ${dadosDolar.variacaoPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {dadosDolar.variacaoPercent >= 0 ? '+' : ''}{dadosDolar.variacaoPercent.toFixed(2)}%
                  </p>
                  {dadosDolar.tendencia && (
                    <div className={`inline-flex items-center gap-1 pb-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
                      dadosDolar.tendencia.cor === 'green' ? 'bg-green-500/15 text-green-400 border-green-500/30' :
                      dadosDolar.tendencia.cor === 'red' ? 'bg-red-500/15 text-red-400 border-red-500/30' :
                      'bg-slate-500/15 text-slate-400 border-slate-500/30'
                    }`}>
                      {dadosDolar.tendencia.direcao === 'alta' ? <TrendingUp size={12} /> : dadosDolar.tendencia.direcao === 'baixa' ? <TrendingDown size={12} /> : <Minus size={12} />}
                      {dadosDolar.tendencia.texto}
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Atualizado em: {dadosDolar.atualizadoEm}
                </p>

                {dadosDolar.historico && dadosDolar.historico.length > 1 ? (
                  <>
                    <div className="h-32 mt-4 -mx-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={dadosDolar.historico}>
                          <Line
                            type="monotone"
                            dataKey="preco"
                            stroke={dadosDolar.variacaoPercent >= 0 ? '#4ade80' : '#f87171'}
                            strokeWidth={2}
                            dot={false}
                          />
                          <XAxis dataKey="data" hide />
                          <YAxis domain={['auto', 'auto']} hide />
                          <Tooltip
                            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
                            labelStyle={{ color: '#94a3b8' }}
                            formatter={(value) => [`R$ ${value.toFixed(4)}`, 'Cotação']}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    {dadosDolar.sinal && (
                      <>
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-700">
                          <div className="text-xs text-slate-400">
                            RSI: <span className="font-semibold text-slate-200">{dadosDolar.rsi?.toFixed(1) ?? '-'}</span>
                          </div>
                          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
                            dadosDolar.sinal.cor === 'green' ? 'bg-green-500/15 text-green-400 border-green-500/30' :
                            dadosDolar.sinal.cor === 'red' ? 'bg-red-500/15 text-red-400 border-red-500/30' :
                            dadosDolar.sinal.cor === 'yellow' ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' :
                            'bg-slate-500/15 text-slate-400 border-slate-500/30'
                          }`}>
                            {dadosDolar.sinal.texto}
                          </div>
                        </div>
                        {dadosDolar.sinal.detalhes && (dadosDolar.sinal.detalhes.macdHistograma != null || dadosDolar.sinal.detalhes.bollingerPosicao != null) && (
                          <div className="flex gap-3 mt-2 text-xs text-slate-500">
                            {dadosDolar.sinal.detalhes.macdHistograma != null && (
                              <span>MACD hist: {dadosDolar.sinal.detalhes.macdHistograma}</span>
                            )}
                            {dadosDolar.sinal.detalhes.bollingerPosicao != null && (
                              <span>Posição Bollinger: {dadosDolar.sinal.detalhes.bollingerPosicao}</span>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <div className="mt-4 bg-slate-900/50 rounded-lg p-3 text-sm text-slate-400">
                    Histórico do dólar não disponível para análise técnica neste momento.
                  </div>
                )}

                <div className="mt-4 bg-yellow-900/20 border border-yellow-900/30 rounded-lg p-3 text-xs text-yellow-300/80">
                  Atenção: o dólar é fortemente influenciado por fatores macroeconômicos (juros, política, fluxo de capital) que estes indicadores técnicos não capturam. Use como apoio, não como única base de decisão.
                </div>
              </div>
            ) : (
              !loading && (
                <p className="text-sm text-slate-400">Não foi possível carregar a cotação do dólar agora. Tente atualizar.</p>
              )
            )}
          </div>
        )}

        {abaSelecionada === 'fundos' && (
          <div className="space-y-4">
            <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
              <h3 className="text-lg font-bold mb-2">Onde encontrar ranking de fundos de investimento</h3>
              <p className="text-sm text-slate-400 mb-4">
                Os dados oficiais da CVM exigem download de arquivos grandes, então aqui estão as fontes públicas e confiáveis mais usadas no Brasil:
              </p>

              <div className="space-y-3">
                <a href="https://www.gov.br/cvm/pt-br" target="_blank" rel="noopener noreferrer"
                   className="flex items-center justify-between bg-slate-900/50 hover:bg-slate-900 rounded-lg p-3 transition-colors group">
                  <div>
                    <p className="font-medium text-sm">CVM - Comissão de Valores Mobiliários</p>
                    <p className="text-xs text-slate-500">Dados oficiais e públicos de rentabilidade de todos os fundos registrados</p>
                  </div>
                  <ExternalLink size={16} className="text-slate-500 group-hover:text-blue-400" />
                </a>

                <a href="https://www.comparadordefundos.cvm.gov.br" target="_blank" rel="noopener noreferrer"
                   className="flex items-center justify-between bg-slate-900/50 hover:bg-slate-900 rounded-lg p-3 transition-colors group">
                  <div>
                    <p className="font-medium text-sm">Comparador de Fundos (CVM)</p>
                    <p className="text-xs text-slate-500">Ferramenta oficial gratuita para comparar rentabilidade e taxas entre fundos</p>
                  </div>
                  <ExternalLink size={16} className="text-slate-500 group-hover:text-blue-400" />
                </a>

                <a href="https://statusinvest.com.br/fundos-de-investimento/busca-avancada" target="_blank" rel="noopener noreferrer"
                   className="flex items-center justify-between bg-slate-900/50 hover:bg-slate-900 rounded-lg p-3 transition-colors group">
                  <div>
                    <p className="font-medium text-sm">StatusInvest - Busca Avançada de Fundos</p>
                    <p className="text-xs text-slate-500">Filtros por rentabilidade, categoria, risco e taxas, gratuito para consulta</p>
                  </div>
                  <ExternalLink size={16} className="text-slate-500 group-hover:text-blue-400" />
                </a>

                <a href="https://www.morningstar.com.br" target="_blank" rel="noopener noreferrer"
                   className="flex items-center justify-between bg-slate-900/50 hover:bg-slate-900 rounded-lg p-3 transition-colors group">
                  <div>
                    <p className="font-medium text-sm">Morningstar Brasil</p>
                    <p className="text-xs text-slate-500">Ratings e classificações independentes de fundos de investimento</p>
                  </div>
                  <ExternalLink size={16} className="text-slate-500 group-hover:text-blue-400" />
                </a>
              </div>
            </div>

            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-sm text-slate-400">
              <p className="font-medium text-slate-300 mb-1">O que olhar ao comparar fundos</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Rentabilidade nos últimos 12, 24 e 36 meses (não só no último mês)</li>
                <li>Taxa de administração e taxa de performance</li>
                <li>Patrimônio líquido e número de cotistas (liquidez)</li>
                <li>Comparar sempre com um benchmark (CDI, Ibovespa, IPCA+)</li>
                <li>Risco (volatilidade) compatível com seu perfil de investidor</li>
              </ul>
            </div>
          </div>
        )}

        <div className="mt-6 text-center text-xs text-slate-500">
          ⚠️ Este painel é apenas informativo e não constitui recomendação de investimento. Os sinais são gerados por cálculos técnicos simples e podem não refletir o melhor momento real de compra ou venda.
        </div>
      </div>
    </div>
  );
}
