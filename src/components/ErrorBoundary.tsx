import React from 'react';

// Captura erros de renderização que, sem isso, derrubam o app inteiro numa tela branca
// sem nenhuma forma de voltar. Mostra uma tela de recuperação com botão de reiniciar.
export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  declare props: { children: React.ReactNode };
  state: { hasError: boolean; error?: Error } = { hasError: false };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Erro capturado pelo ErrorBoundary:', error, info);
  }

  handleReload = () => {
    // Recarrega mantendo a página atual (#app, #agendar etc) — antes limpava o link, o
    // que jogava até quem estava no sistema de volta pra página "em construção" da raiz.
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen flex items-center justify-center bg-[#FDFBF9] p-6">
          <div className="w-full max-w-md bg-white p-10 rounded-[32px] shadow-sm border border-[#F5F2F0] text-center">
            <h1 className="text-2xl font-light text-[#4A433D] mb-3 serif">Algo deu errado</h1>
            <p className="text-[#9CA3AF] font-light mb-8">
              Ocorreu um erro inesperado. Seus dados estão salvos — clique abaixo pra reiniciar o app.
            </p>
            <button
              onClick={this.handleReload}
              className="w-full py-4 bg-[#EADFD4] text-white rounded-2xl font-medium hover:bg-[#DFCFBF] transition-all shadow-sm active:scale-[0.98]"
            >
              Reiniciar Aplicativo
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
