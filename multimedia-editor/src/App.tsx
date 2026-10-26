import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import PhotoEditor from './pages/PhotoEditor';
import './index.css';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/photo" element={<PhotoEditor />} />
      </Routes>
    </BrowserRouter>
  );
}
