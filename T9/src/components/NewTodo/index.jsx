import "./style.css";
import React from "react";
import {useState} from 'react'

function NewTodo({addTodo}) {
    const [value, setValue] = useState("");

    const handleChange = e => {
        setValue(e.target.value);
    }

    const handleSubmit = e => {
        e.preventDefault();

        if (value.trim() === "") {return;}
        addTodo(value.trim());
        setValue("");
    }

    return (
        <form className="new-todo row" onSubmit={handleSubmit}>
            <input type="text" value = {value} placeholder="Enter a new task" onChange={handleChange}/>
            <button type='submit'>+</button>
        </form>
        
    )
    
}

export default NewTodo;
