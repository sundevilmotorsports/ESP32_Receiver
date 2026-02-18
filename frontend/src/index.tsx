import { render } from 'preact';

import preactLogo from './assets/preact.svg';
import './style.css';
import {useEffect, useState} from "preact/hooks";

interface TimingGate {
	macaddr: string;
	timestamp: string; // ms
	time_delta: string; // ms
}

interface GatesResponse {
	gates: TimingGate[];
}

interface Telemetry {
	key: string;
	value: string;
}

export function App() {
	const [telemetry, setTelemetry] = useState<Telemetry[]>([]);

	useEffect(() => {
		const fetchTelemetry = async () => {
			const data = await fetch("/telemetry");

			const json: Telemetry[] = await data.json();
			setTelemetry(json);
		}

		const interval = setInterval(async () => {
			await fetchTelemetry();
		}, 1000);

		return () => {
			clearInterval(interval);
		};
	}, []);

	return (
		<div>
			<ul>
			{telemetry.map((tel) => (
				<li>{`${tel.key}: ${tel.value}`}</li>
			))}
			</ul>
		</div>
	);
}

function Resource(props) {
	return (
		<a href={props.href} target="_blank" class="resource">
			<h2>{props.title}</h2>
			<p>{props.description}</p>
		</a>
	);
}

render(<App />, document.getElementById('app'));
