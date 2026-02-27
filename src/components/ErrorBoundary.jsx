import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex-1 flex items-center justify-center bg-slate-50 p-8">
          <div className="bg-white border border-red-200 rounded-2xl p-6 max-w-lg w-full shadow-sm">
            <p className="text-sm font-semibold text-red-600 mb-2">화면 오류 발생</p>
            <p className="text-xs text-slate-500 font-mono bg-slate-50 rounded p-3 break-all">
              {this.state.error.message}
            </p>
            <button
              onClick={() => this.setState({ error: null })}
              className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
            >
              다시 시도
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
