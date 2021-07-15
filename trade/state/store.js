import { createStore, applyMiddleware } from 'redux';
import thunk from 'redux-thunk';
import { signal as rootReducer } from './reducers';

const tradeEngineStore = () => createStore(rootReducer, applyMiddleware(thunk));

export default tradeEngineStore