import { Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { BrandPage } from './pages/BrandPage';
import { CalendarPage } from './pages/CalendarPage';
import { IdeasPage } from './pages/IdeasPage';
import { LandingPage } from './pages/LandingPage';
import { OverviewPage } from './pages/OverviewPage';
import { ReviewPage } from './pages/ReviewPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/app" element={<AppLayout />}>
        <Route index element={<OverviewPage />} />
        <Route path="ideas" element={<IdeasPage />} />
        <Route path="review" element={<ReviewPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="brand" element={<BrandPage />} />
      </Route>
    </Routes>
  );
}
