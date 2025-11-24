import "./Detail.css";
import { useCities } from "../contexts/CitiesContext";
import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import NotFound from "./NotFound";

function Weather({ city }) {
    const [weather, setWeather] = useState(null);

    useEffect(() => {
        async function fetchWeather() {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.latitude}&longitude=${city.longitude}&current=temperature_2m,wind_speed_10m,relative_humidity_2m,precipitation_probability`;

            const response = await fetch(url);
            const data = await response.json();

            setWeather(data.current);
        }

        fetchWeather();
    }, [city.latitude, city.longitude]);

    if (!weather) {
        return <div className="spinner"></div>;
    }

    return <>
        <h1>{city.name}</h1>
        {weather ? <div className="weather-info">
            <div>
                <h3>Temperature</h3>
                <p>{weather.temperature_2m}°C</p>
            </div>
            <div>
                <h3>Humidity</h3>
                <p>{weather.relative_humidity_2m}%</p>
            </div>
            <div>
                <h3>Wind</h3>
                <p className="small">{weather.wind_speed_10m} km/h</p>
            </div>
            <div>
                <h3>Precipitation</h3>
                <p>{weather.precipitation_probability}%</p>
            </div>
        </div> : <div className="spinner"></div>}
    </>;
}

function Detail() {
    const { cities } = useCities();
    const { cityId } = useParams();
    const navigate = useNavigate();

    const city = cities.find(c => c.id === Number(cityId));

    if (!city) return <NotFound />;

    return  <>
        <Weather city={city} />
        <button className="btn" onClick={() => navigate(-1)}>Back</button>
    </>;
}

export default Detail;