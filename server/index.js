import express from 'express'
import { Server } from "socket.io"
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = process.env.PORT || 3500
const ADMIN = "Admin"
const app = express()

app.use(express.static(path.join(__dirname, "public")))

const expresServer = app.listen(PORT, () => {
    console.log(`listening on port ${PORT}`)
})

// state
const UserState = {
    users: [],
    setUsers: function (newUserArray) {
        this.users = newUserArray
    }
}

const io = new Server(expresServer, {
    cors: {
        origin: process.env.NODE_ENV === "production" ? false : ["http://localhost:5500", "http://127.0.0.1:5500"]
    }
})


io.on('connection', socket => {
    console.log(`User ${socket.id} connected`)

    // Upon connection - only to user
    socket.emit('message', buildMsg(ADMIN, "Welcome to Chat App"))

    socket.on('enterRoom', ({ name, room }) => {
        const previousRoom = getUser(socket.id)?.room
        if (previousRoom) {
            socket.leave(previousRoom)
            io.to(previousRoom).emit('message', buildMsg(ADMIN, `${name} has left the room`));
        }
        const user = activateUser(socket.id, name, room);

        //cannot update previous room users list until after the state update in activate user
        if (previousRoom) {
            io.to(previousRoom).emit('userList', {
                users: getUsersInRoom(previousRoom)
            })
        }

        socket.join(user.room);

        //To user who joined
        socket.emit('message', buildMsg(ADMIN, `You have joined the ${user.room} chat room`))

        //To everyone in the room
        socket.broadcast.to(user.room).emit('message', buildMsg(ADMIN, `${user.name} has joined the room`));

        //Update user list for room
        io.to(user.room).emit('user-list', {
            users: getUsersInRoom(user.room)
        })

        io.emit('roomList', {
            rooms: getAllActiveRooms()
        })
    })

    //when user disconnect - to all others
    socket.on('disconnect', () => {
        const user = getUser(socket.id);
        userLeavesApp(socket.id)

        if (user) {
            io.emit(user.room).emit('message', buildMsg(ADMIN, `${user.name} left the room`))
            io.to(user.room).emit('userList', {
                users: getUsersInRoom(user.room)
            })
            io.emit('roomList', {
                rooms: getAllActiveRooms()
            })
        }
        console.log(`User ${socket.id} disconnected`)

    })

    //Listening for a message event
    socket.on('message', ({ name, text }) => {
        //send message to user room
        const room = getUser(socket.id)?.room;
        if (room) {
            io.to(room).emit('message', buildMsg(name, text))
        }

    })


    //Listening for activity (user for typing ...)
    socket.on('activity', (name) => {
        const room = getUser(socket.id)?.room;
        if (room) {
            socket.broadcast.to('activity').emit("activity", name)
        }

    })

    // //Upon connection - to all others
    // socket.broadcast.emit('message', `User ${socket.id.substring(0, 5)} connected`)


})

function buildMsg(name, text) {
    return {
        name,
        text,
        time: new Intl.DateTimeFormat('default', {
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric'
        }).format(new Date())
    }
}

//User functions
function activateUser(id, name, room) {
    const user = { id, name, room }
    UserState.setUsers(
        [
            ...UserState.users.filter(user => user.id !== id),
            user
        ]
    )
    return user
}

function userLeavesApp(id) {
    UserState.setUsers(UserState.users.filter(user => user.id !== id))
}

function getUser(id) {
    return UserState.users.find(user => user.id === id);
}

function getUsersInRoom(room) {
    return UserState.users.filter(user => user.room === room);
}

function getAllActiveRooms() {
    return Array.from(new Set(UserState.users.map(user => user.room)))
}