import { Route, Routes } from 'react-router-dom';
import { PublicCasePage } from '../features/public-case/PublicCasePage';
import { UnavailablePage } from '../features/public-case/PublicCasePage';

export function AppRouter() {
  return <Routes><Route path="/p/:token" element={<PublicCasePage />} /><Route path="/public/:token" element={<PublicCasePage />} /><Route path="/case/:token/*" element={<PublicCasePage />} /><Route path="/" element={<PublicCasePage />} /><Route path="*" element={<UnavailablePage />} /></Routes>;
}
