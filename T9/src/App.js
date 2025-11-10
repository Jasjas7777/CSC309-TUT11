import "./App.css";
import { useState } from "react";
import NewTodo from './components/NewTodo';
import TodoItem from './components/TodoItem';

// You can use this to seed your TODO list
const seed = [
    { id: 0, text: "Submit assignment 2", completed: false },
    { id: 1, text: "Reschedule the dentist appointment", completed: false },
    { id: 2, text: "Prepare for CSC309 exam", completed: false },
    { id: 3, text: "Find term project partner", completed: true },
    { id: 4, text: "Learn React Hooks", completed: false },
];



function App() {
    const title = "My ToDos";
    const [todos, setTodos] = useState(seed);

    const addTodo = todo => {
        setTodos([...todos, {id: Date.now(), text: todo, completed: false}])
    }

    const toggleComplete = id => {
        setTodos(todos.map(todo => todo.id === id? {...todo, completed: !todo.completed}: todo));

    }

    const deleteTodo = id => {
        setTodos(todos.filter(todo => todo.id !== id))
    }

    return (
        <div className="app">
            <h1>{title}</h1>
            <NewTodo addTodo={addTodo} />
            {todos.map((todo, index) => (
                <TodoItem todo={todo} key={index} toggleComplete={toggleComplete} deleteTodo={deleteTodo} />
            ))}
    </div>
    );
}

export default App;
