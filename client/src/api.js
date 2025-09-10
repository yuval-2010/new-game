import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:8080';
export const socket = io(SERVER_URL, { autoConnect: true });
