import './App.css';
import { CitiesProvider } from './contexts/CitiesContext';
import Layout from './components/Layout';
import { BrowserRouter} from "react-router-dom";
import { Routes, Route} from "react-router-dom";
import Home from "./pages/Home";
import Detail from './pages/Detail';
import NotFound from './pages/NotFound';

const App = () => {
    return <CitiesProvider>
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Layout />} >
                    <Route index element={<Home />} />
                    <Route path=":cityId" element={<Detail />} />
                    <Route path="*" element={<NotFound />} />
                </Route>
            </Routes>
        </BrowserRouter>
    </CitiesProvider>;
};

export default App;