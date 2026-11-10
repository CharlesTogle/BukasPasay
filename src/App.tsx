import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { Footer, Masthead } from './components/Chrome';
import ScrollToTop from './components/ScrollToTop';
import { configProblems } from './config';
import { usePortal } from './lib/portal-context';
import About from './pages/About';
import City from './pages/City';
import Home from './pages/Home';
import Project from './pages/Project';
import Enacted from './pages/Enacted';

export default function App() {
  const { config } = usePortal();
  const problems = import.meta.env.DEV ? configProblems(config) : [];
  return (
    <>
      <ScrollToTop />
      <Masthead />
      {problems.length > 0 && (
        <div className="page config-warning" role="alert">
          <strong>portal.config.ts needs attention</strong> (shown in development only):
          <ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}
      <Routes>
        <Route path="/" element={<Home />} />
        {/* Offices and their districts are a section of the main page; old links land there. */}
        <Route path="/districts" element={<Navigate to="/#offices" replace />} />
        <Route path="/lungsod" element={<City />} />
        <Route path="/gaa" element={<Enacted />} />
        <Route path="/about" element={<About />} />
        <Route path="/projects/:dataset/:id" element={<Project />} />
        <Route
          path="*"
          element={
            <main id="nilalaman" className="page main">
              <p className="state">Walang ganitong pahina. <Link to="/">Tingnan ang lahat ng proyekto</Link></p>
            </main>
          }
        />
      </Routes>
      <Footer />
    </>
  );
}
