import { Route, Routes } from 'react-router-dom';
import App from './App.jsx';
import Home from './pages/Home.jsx';
import Course from './pages/Course.jsx';
import Lesson from './pages/Lesson.jsx';
import Callback from './pages/Callback.jsx';
import NotFound from './pages/NotFound.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

/**
 * Route table.
 *
 * The lesson path is index-based rather than lesson-id-based, matching the brief. That
 * makes prev/next navigation and the sidebar's table of contents pure position
 * arithmetic, and it is why array order in Course.modules / Module.lessons is treated as
 * the canonical ordering server-side.
 *
 * /callback sits outside the app layout: it is a transient stop in the Auth0 redirect and
 * rendering the sidebar there would fire course requests before a token exists.
 */
export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/callback" element={<Callback />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <App />
          </ProtectedRoute>
        }
      >
        <Route index element={<Home />} />
        <Route path="courses/:courseId" element={<Course />} />
        <Route
          path="courses/:courseId/module/:moduleIndex/lesson/:lessonIndex"
          element={<Lesson />}
        />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
