import { ExampleActions, ExampleActionTypes } from "../actions/example.action";

export function exampleReducer(state = {result: 'reducer'}, action: ExampleActions) {
    switch(action.type) {
        case ExampleActionTypes.EXAMPLE_REQUEST: {
            return {
                ...state, 
                query: action.payload,
                result: '',
                loading: true
            }
        }
        case ExampleActionTypes.EXAMAPLE_FEEDBACK: {
            return {
                ...state,
                result: action.payload,
                loading: false
            }
        }
        default: return {...state}
    }
}