import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { LandingPage } from './pages/LandingPage';
import { HistoricalPrices } from './pages/HistoricalPrices';
import { Indicators } from './pages/Indicators';
import { PortfolioBacktester } from './pages/PortfolioBacktester';
import { Heatmap } from './pages/Heatmap';

const App: React.FC = () => {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/prices" element={<HistoricalPrices />} />
          <Route path="/indicators" element={<Indicators />} />
          <Route path="/backtester" element={<PortfolioBacktester />} />
          <Route path="/heatmap" element={<Heatmap />} />
        </Routes>
      </Layout>
    </Router>
  );
};

export default App;
