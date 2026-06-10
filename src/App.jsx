import { useEffect, useState } from 'react'
import './App.css'
const STORAGE_KEY = 'saved-locations'
const STORAGE_SELECTED_KEY = 'selected-location-id'
const MAX_STORED_ADDRESSES = 10
const FORECAST_REFRESH_INTERVAL_MS = 60 * 60 * 1000

function formatTime(iso) {
  if (!iso) return 'N/A'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    return `${month}/${day} ${time}`
  } catch {
    return iso
  }
}

function loadSavedLocations() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

function loadSavedSelectedLocation() {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(STORAGE_SELECTED_KEY)
  } catch {
    return null
  }
}

function App() {
  const [showLocations, setShowLocations] = useState(false)
  const [locationInput, setLocationInput] = useState('')
  const [locations, setLocations] = useState(() => loadSavedLocations() || [])
  const [selectedLocationId, setSelectedLocationId] = useState(() => {
    const savedSelection = loadSavedSelectedLocation()
    const saved = loadSavedLocations() || []
    if (savedSelection && saved.some((item) => item.id === savedSelection)) return savedSelection
    if (saved.length > 0) return saved[0].id
    return null
  })
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [coordinates, setCoordinates] = useState(null)
  const [weatherData, setWeatherData] = useState(null)
  const [forecastHourlyData, setForecastHourlyData] = useState(null)
  const [forecastData, setForecastData] = useState(null)
  const [lastRefreshed, setLastRefreshed] = useState(null)
  const selectedLocation = locations.find((location) => location.id === selectedLocationId) || locations[0]
  const upcomingHourlyData = forecastHourlyData?.filter((period) => {
    if (!period?.startTime) return false
    const periodStart = new Date(period.startTime)
    if (Number.isNaN(periodStart.getTime())) return false
    const currentHourStart = new Date()
    currentHourStart.setMinutes(0, 0, 0, 0)
    return periodStart >= currentHourStart
  }) ?? []

  const persistLocationState = () => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(locations))
    window.localStorage.setItem(STORAGE_SELECTED_KEY, selectedLocationId)
  }

  useEffect(() => {
    persistLocationState()
  }, [locations, selectedLocationId])

  const updateLocation = (id, updates) => {
    setLocations((previous) => previous.map((location) => (location.id === id ? { ...location, ...updates } : location)))
  }

  const fetchForecast = async (latitude, longitude) => {
    setSubmitted(true)
    setError('')
    setLoading(true)
    setCoordinates({ latitude, longitude })
    setWeatherData(null)
    setForecastHourlyData(null)
    setForecastData(null)

    try {
      const weatherEndpoint = `https://api.weather.gov/points/${latitude},${longitude}`
      const weatherResponse = await fetch(weatherEndpoint)
      if (!weatherResponse.ok) {
        throw new Error(`Weather lookup failed with status ${weatherResponse.status}`)
      }
      const weatherJson = await weatherResponse.json()
      setWeatherData(weatherJson)

      const hourlyUrl = weatherJson?.properties?.forecastHourly
      if (hourlyUrl) {
        const hourlyResponse = await fetch(hourlyUrl)
        if (!hourlyResponse.ok) {
          throw new Error(`Hourly forecast lookup failed with status ${hourlyResponse.status}`)
        }
        const hourlyJson = await hourlyResponse.json()
        setForecastHourlyData(hourlyJson?.properties?.periods || null)
      }

      const forecastUrl = weatherJson?.properties?.forecast
      if (forecastUrl) {
        const forecastResponse = await fetch(forecastUrl)
        if (!forecastResponse.ok) {
          throw new Error(`Forecast lookup failed with status ${forecastResponse.status}`)
        }
        const forecastJson = await forecastResponse.json()
        setForecastData(forecastJson?.properties?.periods || null)
      }
      setLastRefreshed(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load forecast.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!selectedLocation) return
    if (selectedLocation.latitude == null || selectedLocation.longitude == null) return

    fetchForecast(selectedLocation.latitude, selectedLocation.longitude)
    const intervalId = window.setInterval(() => {
      fetchForecast(selectedLocation.latitude, selectedLocation.longitude)
    }, FORECAST_REFRESH_INTERVAL_MS)

    return () => window.clearInterval(intervalId)
  }, [selectedLocationId, selectedLocation?.latitude, selectedLocation?.longitude])

  const handleSelectLocation = (id) => {
    setError('')
    setSelectedLocationId(id)
    setShowLocations(false)
    setSubmitted(true)
  }

  const handleAddLocation = async () => {
    if (!locationInput.trim()) {
      setError('Enter an address before adding it to locations.')
      return
    }

    if (locations.length >= MAX_STORED_ADDRESSES) {
      setError('You can save up to 10 addresses.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const censusGeocoderUrl = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress'
      const query = `address=${encodeURIComponent(locationInput.trim())}&benchmark=Public_AR_Current&format=json`
      const endpoint = import.meta.env.DEV
        ? `/api/geocode?${query}`
        : `https://api.allorigins.win/raw?url=${encodeURIComponent(`${censusGeocoderUrl}?${query}`)}`

      const response = await fetch(endpoint)
      if (!response.ok) {
        throw new Error(`Geocoding request failed with status ${response.status}`)
      }
      const data = await response.json()
      const match = data?.result?.addressMatches?.[0]
      if (!match?.coordinates) {
        throw new Error('No geocoding match found for this address.')
      }

      const newLocation = {
        id: `${Date.now()}`,
        address: locationInput.trim(),
        latitude: match.coordinates.y,
        longitude: match.coordinates.x,
      }
      setLocations((previous) => [...previous, newLocation])
      setSelectedLocationId(newLocation.id)
      setLocationInput('')
      setShowLocations(false)
      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add location.')
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveLocation = (id) => {
    setLocations((previous) => previous.filter((location) => location.id !== id))
    if (selectedLocationId === id) {
      const remaining = locations.filter((l) => l.id !== id)
      setSelectedLocationId(remaining.length > 0 ? remaining[0].id : null)
      setSubmitted(true)
    }
  }

  return (
    <main className="app-shell">
      <div className="topbar">
        <button className="location-toggle-button" type="button" onClick={() => setShowLocations(true)}>
          Locations
        </button>
      </div>

      {showLocations && (
        <section className="locations-panel">
          <div className="locations-panel-header">
            <div>
              <h2>Locations</h2>
              <p className="panel-description">Select a saved location or add a new address to store its coordinates.</p>
            </div>
            <button type="button" className="panel-close-button" onClick={() => setShowLocations(false)}>
              Close
            </button>
          </div>

          <div className="location-card-grid">
            {locations.map((location, index) => (
              <div key={location.id} className={`location-item ${selectedLocationId === location.id ? 'selected' : ''}`}>
                <div className="location-item-header">
                  <span>Address {index + 1}</span>
                  <button
                    type="button"
                    className="location-remove-button"
                    onClick={() => handleRemoveLocation(location.id)}
                  >
                    Remove
                  </button>
                </div>
                <p className="location-item-address">{location.address}</p>
                <div className="location-coords">
                  <span>
                    <strong>Lat:</strong> {location.latitude ?? '—'}
                  </span>
                  <span>
                    <strong>Lng:</strong> {location.longitude ?? '—'}
                  </span>
                </div>
                <button type="button" className="location-use-button" onClick={() => handleSelectLocation(location.id)}>
                  Use this location
                </button>
              </div>
            ))}
          </div>

          <div className="location-add-form">
            <label>
              Add a new address
              <input
                type="text"
                value={locationInput}
                onChange={(event) => setLocationInput(event.target.value)}
                placeholder="123 Main St, Anytown, CA 90210"
              />
            </label>
            <button type="button" onClick={handleAddLocation} disabled={loading || locations.length >= MAX_STORED_ADDRESSES + 1}>
              {loading ? 'Saving…' : 'Add location'}
            </button>
          </div>

          {error && <p className="error-message">{error}</p>}
        </section>
      )}

      <section className="selected-card">
        <p>
          {selectedLocation?.address
            ? `Address: ${selectedLocation.address}`
            : 'Pick a location from the panel to see weather and coordinates.'}
        </p>
        {lastRefreshed && (
          <p className="refresh-timestamp">
            Last refreshed: {lastRefreshed.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
          </p>
        )}
        {/*}
        <div className="selected-info">
          <div>
            <strong>Latitude:</strong> {selectedLocation?.latitude ?? '—'}
          </div>
          <div>
            <strong>Longitude:</strong> {selectedLocation?.longitude ?? '—'}
          </div>
          <div>
            <strong>Type:</strong> {selectedLocation?.isCurrent ? 'Current Location' : 'Saved Address'}
          </div>
        </div>
          */}

        {loading && <p>Loading forecast…</p>}
        {error && !showLocations && <p className="error-message">{error}</p>}
      </section>

      {submitted && weatherData && (
        <section className="address-summary">
          {/*
          <h2>Weather Summary</h2>
          <div className="weather-summary">
            <p>
              <strong>Forecast office:</strong>{' '}
              {weatherData.properties?.forecastOffice || 'Unknown'}
            </p>
            <p>
              <strong>Grid:</strong>{' '}
              {weatherData.properties?.gridId} {weatherData.properties?.gridX}, {weatherData.properties?.gridY}
            </p>
            <p>
              <strong>Forecast URL:</strong>{' '}
              <a href={weatherData.properties?.forecast} target="_blank" rel="noreferrer">
                {weatherData.properties?.forecast}
              </a>
            </p>
            <p>
              <strong>Hourly forecast URL:</strong>{' '}
              <a href={weatherData.properties?.forecastHourly} target="_blank" rel="noreferrer">
                {weatherData.properties?.forecastHourly}
              </a>
            </p>
          </div>
           */}   
          {upcomingHourlyData?.length > 0 && (
            <div className="hourly-forecast-container">
              <h3>Hourly Forecast</h3>
              <div className="hourly-forecast-scroll">
                {upcomingHourlyData.slice(0, 48).map((period) => (
                  <div key={period.number || period.startTime} className="hourly-forecast-card">
                    <div className="hour-time">{formatTime(period.startTime)}</div>
                    <img src={period.icon} alt={period.shortForecast} className="hour-icon" />
                    <div className="hour-temp">{period.temperature}°</div>
                    <div className="hour-precip">
                      {period.probabilityOfPrecipitation?.value != null
                        ? `${period.probabilityOfPrecipitation.value}%`
                        : 'N/A'}
                    </div>
                    <div className="hour-forecast">{period.shortForecast || 'N/A'}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {forecastData?.length > 0 && (
            <div className="forecast-table-container">
              <h3>Forecast</h3>
              <table className="forecast-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Detailed forecast</th>
                  </tr>
                </thead>
                <tbody>
                  {forecastData.map((period) => (
                    <tr key={period.number || period.name}>
                      <td>{period.name}</td>
                      <td>{period.detailedForecast}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  )
}

export default App
