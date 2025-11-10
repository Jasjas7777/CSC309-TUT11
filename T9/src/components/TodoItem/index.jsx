import "./style.css";
import trash from "./trash.webp"

function TodoItem({todo, toggleComplete, deleteTodo}) {

    return (
        <div className="todo-item">
            <input type="checkbox" checked={todo.completed} onChange={() => toggleComplete(todo.id)} />
            <span className={todo.completed ?  "completed" : ""}>{todo.text}</span>
            <a className="a">
                <img className="img" src={trash} alt="Trash icon" onClick={() => deleteTodo(todo.id)} />
            </a>
        </div>
    )

}

export default TodoItem;