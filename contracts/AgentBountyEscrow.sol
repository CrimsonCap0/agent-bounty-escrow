// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract AgentBountyEscrow {
    enum TaskStatus {
        Open,
        Accepted,
        Submitted,
        Approved,
        Cancelled,
        Refunded
    }

    struct Task {
        uint256 id;
        address payable creator;
        address payable worker;
        uint256 bounty;
        string metadataURI;
        string resultURI;
        uint64 createdAt;
        uint64 deadline;
        TaskStatus status;
    }

    uint256 public taskCount;
    bool private locked;
    mapping(uint256 => Task) private tasks;

    event TaskCreated(
        uint256 indexed taskId,
        address indexed creator,
        uint256 bounty,
        string metadataURI,
        uint64 deadline
    );
    event TaskAccepted(uint256 indexed taskId, address indexed worker);
    event TaskSubmitted(uint256 indexed taskId, string resultURI);
    event TaskApproved(uint256 indexed taskId, address indexed worker, uint256 bounty);
    event TaskCancelled(uint256 indexed taskId);
    event TaskRefunded(uint256 indexed taskId);

    modifier nonReentrant() {
        require(!locked, "Reentrant call");
        locked = true;
        _;
        locked = false;
    }

    modifier taskExists(uint256 taskId) {
        require(taskId > 0 && taskId <= taskCount, "Task does not exist");
        _;
    }

    function createTask(string calldata metadataURI, uint64 deadline)
        external
        payable
        returns (uint256 taskId)
    {
        require(msg.value > 0, "Bounty required");
        require(bytes(metadataURI).length > 0, "Metadata required");
        require(deadline > block.timestamp, "Deadline must be future");

        taskId = ++taskCount;
        tasks[taskId] = Task({
            id: taskId,
            creator: payable(msg.sender),
            worker: payable(address(0)),
            bounty: msg.value,
            metadataURI: metadataURI,
            resultURI: "",
            createdAt: uint64(block.timestamp),
            deadline: deadline,
            status: TaskStatus.Open
        });

        emit TaskCreated(taskId, msg.sender, msg.value, metadataURI, deadline);
    }

    function acceptTask(uint256 taskId) external taskExists(taskId) {
        Task storage task = tasks[taskId];
        require(task.status == TaskStatus.Open, "Task not open");
        require(msg.sender != task.creator, "Creator cannot accept");
        require(block.timestamp < task.deadline, "Task expired");

        task.worker = payable(msg.sender);
        task.status = TaskStatus.Accepted;

        emit TaskAccepted(taskId, msg.sender);
    }

    function submitTask(uint256 taskId, string calldata resultURI) external taskExists(taskId) {
        Task storage task = tasks[taskId];
        require(task.status == TaskStatus.Accepted, "Task not accepted");
        require(msg.sender == task.worker, "Only worker");
        require(bytes(resultURI).length > 0, "Result required");

        task.resultURI = resultURI;
        task.status = TaskStatus.Submitted;

        emit TaskSubmitted(taskId, resultURI);
    }

    function approveTask(uint256 taskId) external taskExists(taskId) nonReentrant {
        Task storage task = tasks[taskId];
        require(task.status == TaskStatus.Submitted, "Task not submitted");
        require(msg.sender == task.creator, "Only creator");

        uint256 bounty = task.bounty;
        address payable worker = task.worker;
        task.bounty = 0;
        task.status = TaskStatus.Approved;

        (bool ok, ) = worker.call{value: bounty}("");
        require(ok, "Payment failed");

        emit TaskApproved(taskId, worker, bounty);
    }

    function cancelTask(uint256 taskId) external taskExists(taskId) nonReentrant {
        Task storage task = tasks[taskId];
        require(msg.sender == task.creator, "Only creator");
        require(task.status == TaskStatus.Open, "Cannot cancel");

        uint256 bounty = task.bounty;
        task.bounty = 0;
        task.status = TaskStatus.Cancelled;

        (bool ok, ) = task.creator.call{value: bounty}("");
        require(ok, "Refund failed");

        emit TaskCancelled(taskId);
    }

    function refundExpired(uint256 taskId) external taskExists(taskId) nonReentrant {
        Task storage task = tasks[taskId];
        require(msg.sender == task.creator, "Only creator");
        require(task.status == TaskStatus.Open, "Cannot refund");
        require(block.timestamp >= task.deadline, "Not expired");

        uint256 bounty = task.bounty;
        task.bounty = 0;
        task.status = TaskStatus.Refunded;

        (bool ok, ) = task.creator.call{value: bounty}("");
        require(ok, "Refund failed");

        emit TaskRefunded(taskId);
    }

    function getTask(uint256 taskId) external view taskExists(taskId) returns (Task memory) {
        return tasks[taskId];
    }
}
