import './City.css';
import { useEffect, useState } from "react";
import { useCities } from "../contexts/CitiesContext";
import {Link} from "react-router-dom";



const City = ({ city, setPage }) => {
    const { removeCity } = useCities();
    const [temperature, setTemperature] = useState(null);

    useEffect(() => {
        async function fetchWeather() {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.latitude}&longitude=${city.longitude}&current_weather=true`;

            const response = await fetch(url);
            const data = await response.json();

            setTemperature(data.current_weather.temperature);
        }

        fetchWeather();
    }, []);


    return (
        <div className="city-card">
            <button className="remove-btn" onClick={() => removeCity(city.id)}>×</button>
            <Link to={`/${city.id}`} className="city-link">
            <h2>{city.name}</h2>
                {temperature !== null ? (
                    <p className="temperature">{temperature}°C</p>
                ) : (
                    <div className="spinner"></div>
                )}
            </Link>
        </div>
    );
};

export default City;